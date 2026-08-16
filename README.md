# Poon Jobs

Background job helpers for Poon Meteor apps.

## Usage

```bash
meteor add poon-jobs
```

```javascript
import { createJob } from 'meteor/poon-jobs';
```

## Example

Define jobs on the server. `getWork` returns one document to process, and
`runFn` does the work for that document.

```javascript
import { createJob, RUN } from 'meteor/poon-jobs';
import { Tasks } from '/imports/db';

createJob('Process Tasks', {
	'mode': RUN,
	'getWork': busyIds => Tasks.findOneAsync({
		'_id': {$nin: busyIds},
		'processedOn': {$exists: false},
	}),
	'runFn': async task => {
		// Do the slow or retryable work here.

		await Tasks.updateAsync(task._id, {
			$set: {'processedOn': new Date()},
		});

		return `Processed ${task._id}`;
	},
	'concurrency': 1,
	'interval': 60 * 1000,
});
```

`busyIds` contains documents already being processed by this job, which helps
avoid running the same work twice. `concurrency` controls how many documents a
job can process at the same time and defaults to `1`. In development, jobs
default to `IDLE`; set `mode: RUN` when you want the job loop to run
automatically.
