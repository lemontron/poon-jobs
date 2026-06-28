import { Meteor } from 'meteor/meteor';
import { AdminJobs } from '../db';

const jobs = [];
const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

class Bus {
	constructor(initState) {
		this.state = initState;
		this.listeners = [];
	}

	update = val => {
		if (this.state === val) return;
		this.state = val;
		this.listeners.forEach(fn => fn(val));
	};

	on = cb => {
		this.listeners.push(cb);
		return () => this.listeners = this.listeners.filter(fn => fn !== cb);
	};
}

class Job extends Bus {
	constructor(name) {
		super({'status': 'init'});
		this.name = name;
		this.timeout = null;
		this.work = new Set();
	}

	status = (status, result) => {
		const updates = {
			status,
			'updatedOn': new Date(),
		};
		if (result !== undefined) updates.result = result;
		this.update({
			...this.state,
			...updates,
		});
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

	const run = async () => {
		if (job.work.size > 0) console.log(`[JOB] ${name} might be clogged, size = ${job.work.size}`);

		let doc;
		try {
			job.status('checking');
			doc = await getWork([...job.work]);
			if (doc) {
				job.work.add(doc._id);
				job.status('running');
				const result = await runFn(doc);
				job.status('done', result);
			} else {
				job.status('idle', `Sleeping for ${interval}ms`);
				await sleepMs(interval);
			}
		} catch (err) {
			console.warn('[ERROR]', name);
			console.warn(err);
			job.status('error', err.toString());
		} finally {
			if (doc) job.work.delete(doc._id);
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
		const off = job.on(updates => {
			this.changed('AdminJobs', job.name, updates);
		});
		this.onStop(off);
	});
	this.ready();
});

process.on('SIGTERM', () => {
	jobs.forEach(job => clearTimeout(job.timeout));
	process.exit();
});
