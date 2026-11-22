import { Meteor } from 'meteor/meteor';
import { AdminJobs } from '../db';
import { EventEmitter } from 'node:events';
import { KeyedMutex } from './mutex';

const jobs = [];
const lookups = new KeyedMutex();

class Job extends EventEmitter {
	constructor(name) {
		super();
		this.state = {'status': 'init', busyIds: []};
		this.name = name;
		this.timeout = null;
	}

	status = (status, result) => {
		const updates = {status, 'updatedOn': new Date()};
		if (result !== undefined) updates.result = result;
		this.update(updates);
	};

	update = updates => {
		this.state = {...this.state, ...updates};
		this.emit('status', this.state);
	};
}

export const RUN = 'run';
export const ONCE = 'once';
export const IDLE = 'idle';

export const createJob = (name, {
	mode = Meteor.isProduction ? RUN : IDLE,
	getWork,
	runFn,
	interval,
}) => {
	const job = new Job(name);
	jobs.push(job);
	const work = new Map();

	const reportError = error => {
		console.warn('[ERROR]', name);
		console.warn(error.toString());
		job.status('error', error.toString());
	};

	const run = doc => {
		const existing = work.get(doc._id);
		if (existing) return existing;
		const result = Promise.resolve().then(() => runFn(doc)).then(value => {
			job.status('done', value);
			return value;
		}).finally(() => {
			job.update({busyIds: job.state.busyIds.filter(id => id !== doc._id)});
			// Keep the result available until any pending lookup has used its result.
			if (lookups.has(job)) lookups.runAsync(job, () => work.delete(doc._id));
			else work.delete(doc._id);
		});
		work.set(doc._id, result);
		job.state.busyIds = [...job.state.busyIds, doc._id];
		job.status('running');
		result.catch(reportError);
		return result;
	};

	const poll = async () => {
		try {
			await lookups.runAsync(job, async () => {
				if (!work.size) job.status('checking');
				const doc = await getWork([...work.keys()]);
				if (doc) run(doc);
				else if (!work.size) job.status('idle', `Sleeping for ${interval}ms`);
			});
		} catch (error) {
			reportError(error);
		} finally {
			if (mode === RUN) job.timeout = setTimeout(poll, interval);
		}
	};

	if (mode === ONCE) Meteor.defer(poll);
	if (mode === RUN) poll();

	return run;
};

const serverStartedOn = new Date();

Meteor.publish('AdminJobs', function() {
	if (!this.userId) return this.ready();
	this.added('AdminJobs', 'Start Server', {
		'status': 'done',
		'updatedOn': serverStartedOn,
	});
	jobs.forEach((job, i) => {
		this.added('AdminJobs', job.name, {...job.state, 'index': i});
		const onStatus = updates => {
			this.changed('AdminJobs', job.name, updates);
		};
		job.on('status', onStatus);
		this.onStop(() => job.off('status', onStatus));
	});
	this.ready();
});
