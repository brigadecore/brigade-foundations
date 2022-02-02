import { events, Event, Job, ConcurrentGroup } from "@brigadecore/brigadier"

const goImg = "brigadecore/go-tools:v0.6.0"
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

// A map of all jobs. When a ci:job_requested event wants to re-run a single
// job, this allows us to easily find that job by name.
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

events.on("brigade.sh/github", "ci:pipeline_requested", async event => {
  await new ConcurrentGroup( // Basic tests
    testUnitJob(event),
    lintJob(event),
  ).run()
})

// This event indicates a specific job is to be re-run.
events.on("brigade.sh/github", "ci:job_requested", async event => {
  const job = jobs[event.labels.job]
  if (job) {
    await job(event).run()
    return
  }
  throw new Error(`No job found with name: ${event.labels.job}`)
})

events.process()
