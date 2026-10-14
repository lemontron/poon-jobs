import { Meteor } from 'meteor/meteor';
import { AdminJobs } from '../db';
import { EventEmitter } from 'node:events';

const jobs = [];
const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

class Job extends EventEmitter {
	constructor(name) {
		super();
		this.state = {'status': 'init'};
		this.name = name;
		this.timeout = null;
		this.work = new Set();
	}

	status = (status, result) => {
		const updates = {status, 'updatedOn': new Date()};
		if (result !== undefined) updates.result = result;
		this.state = {
			...this.state,
			...updates,
		};
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
	concurrency = 1,
}) => {
	const job = new Job(name);
	jobs.push(job);
	let checking = false;

	const runDoc = async doc => {
		try {
			const result = await runFn(doc);
			job.status('done', result);
		} catch (err) {
			console.warn('[ERROR]', name);
			console.warn(err);
			job.status('error', err.toString());
		} finally {
			job.work.delete(doc._id);
		}
	};

	const run = async () => {
		if (checking) return;
		checking = true;
		try {
			if (job.work.size >= concurrency) return;

			if (job.work.size === 0) job.status('checking');
			while (job.work.size < concurrency) {
				const doc = await getWork([...job.work]);
				if (!doc) {
					if (job.work.size === 0) {
						job.status('idle', `Sleeping for ${interval}ms`);
						await sleepMs(interval);
					} else {
						job.status('running');
					}
					return;
				}
				if (job.work.has(doc._id)) return;
				job.work.add(doc._id);
				job.status('running');
				runDoc(doc);
			}
		} finally {
			checking = false;
			if (mode === RUN) job.timeout = setTimeout(run, interval);
		}
	};

	if (mode === ONCE) Meteor.defer(run);
	if (mode === RUN) run();

	return runFn;
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

process.on('SIGTERM', () => {
	jobs.forEach(job => clearTimeout(job.timeout));
	process.exit();
});
