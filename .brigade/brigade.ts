import { events, Event, Job, ConcurrentGroup } from "@brigadecore/brigadier"

const goImg = "brigadecore/go-tools:v0.5.0"
const localPath = "/workspaces/brigade-foundations"

// MakeTargetJob is just a job wrapper around one or more make targets.
class MakeTargetJob extends Job {
  constructor(targets: string[], img: string, event: Event, env?: {[key: string]: string}) {
    super(targets[0], img, event)
    this.primaryContainer.sourceMountPath = localPath
    this.primaryContainer.workingDirectory = localPath
    this.primaryContainer.environment = env || {}
    this.primaryContainer.environment["SKIP_DOCKER"] = "true"
    this.primaryContainer.command = [ "make" ]
    this.primaryContainer.arguments = targets
  }
}

// A map of all jobs. When a check_run:rerequested event wants to re-run a
// single job, this allows us to easily find that job by name.
const jobs: {[key: string]: (event: Event) => Job } = {}

const testUnitJobName = "test-unit"
const testUnitJob = (event: Event) => {
  return new MakeTargetJob([testUnitJobName, "upload-code-coverage"], goImg, event, {
    "CODECOV_TOKEN": event.project.secrets.codecovToken
  })
}
jobs[testUnitJobName] = testUnitJob

const lintJobName = "lint"
const lintJob = (event: Event) => {
  return new MakeTargetJob([lintJobName], goImg, event)
}
jobs[lintJobName] = lintJob

async function runSuite(event: Event): Promise<void> {
  await new ConcurrentGroup( // Basic tests
    testUnitJob(event),
    lintJob(event),
  ).run()
}

// Either of these events should initiate execution of the entire test suite.
events.on("brigade.sh/github", "check_suite:requested", runSuite)
events.on("brigade.sh/github", "check_suite:rerequested", runSuite)

// This event indicates a specific job is to be re-run.
events.on("brigade.sh/github", "check_run:rerequested", async event => {
  // Check run names are of the form <project name>:<job name>, so we strip
  // event.project.id.length + 1 characters off the start of the check run name
  // to find the job name.
  const jobName = JSON.parse(event.payload).check_run.name.slice(event.project.id.length + 1)
  const job = jobs[jobName]
  if (job) {
    await job(event).run()
    return
  }
  throw new Error(`No job found with name: ${jobName}`)
})

events.process()
