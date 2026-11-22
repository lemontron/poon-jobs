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
	'interval': 60 * 1000,
});
```

The function returned by `createJob` starts a document immediately. Manual and
scheduled calls for the same document share its in-flight promise. Different
documents can run independently. The worker passes running IDs to `getWork`
so it can select another eligible document.
In development, jobs default to `IDLE`.
Set `mode: RUN` to run the job loop automatically.
