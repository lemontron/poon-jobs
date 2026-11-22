export class KeyedMutex {
	work = new Map();

	keys = () => [...this.work.keys()];

	has = key => this.work.has(key);

	runAsync = async (key, fn) => {
		const previous = this.work.get(key);
		let release;

		const current = new Promise(resolve => {
			release = resolve;
		});

		this.work.set(key, current);

		try {
			await previous;
			return await fn();
		} finally {
			if (this.work.get(key) === current) this.work.delete(key);
			release();
		}
	};
}
