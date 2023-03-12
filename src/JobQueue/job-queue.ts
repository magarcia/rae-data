import _debug from 'debug';

const debug = _debug('job-queue');

export type Job = (...args: any[]) => any;

export type JobQueueOptions = {
	parallel: number;
};

/**
A job queue that processes jobs in parallel with a maximum number of parallel jobs.
@example
const jobQueue = new JobQueue({ parallel: 3 });

jobQueue.add(() => fetch('https://example.com/data'));
jobQueue.add(() => new Promise(resolve => setTimeout(resolve, 1000)));

jobQueue.onJobFinished((result) => console.log('Job result:', result));

await jobQueue.wait();
*/
export default class JobQueue {
	private readonly jobQueue: Job[] = [];
	private isProcessing = false;
	private readonly parallel: number;
	private readonly callbacks: Array<(...args: any[]) => void> = [];

	/**
	 * Creates a new JobQueue instance
	 * @param options - Options to configure the job queue
	 * @param options.parallel - Maximum number of parallel jobs to process
	 */
	constructor(options: JobQueueOptions) {
		debug(
			`Creating a new JobQueue instance with options: ${JSON.stringify(
				options,
			)}`,
		);
		this.parallel = options.parallel;
	}

	get pending(): number {
		return this.jobQueue.length;
	}

	/**
	 * Adds one or more jobs to the queue
	 * @param jobs - One or more functions that return promises that resolve to a result
	 */
	add(...jobs: Job[]): void {
		for (const job of jobs) {
			// Check if the job is already in the queue
			if (this.jobQueue.includes(job)) {
				debug('Job already in queue');
				continue;
			}

			debug('Adding job to queue');
			this.jobQueue.push(job);
		}

		// Start processing jobs if the queue is not already being processed
		if (!this.isProcessing) {
			debug('Starting to process jobs');
			this.processJobs(); // eslint-disable-line @typescript-eslint/no-floating-promises
		}
	}

	/**
	 * Waits for all jobs in the queue to be processed
	 * @returns Promise that resolves when all jobs are done
	 */
	async wait(): Promise<void> {
		// Wait until the job queue is empty
		while (this.jobQueue.length > 0) {
			if (!this.isProcessing) {
				this.processJobs(); // eslint-disable-line @typescript-eslint/no-floating-promises
			}

			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => {
				setTimeout(resolve, 100);
			});
		}
	}

	/**
	 * Registers a callback to be called when a job is finished
	 * @param callback - A function that takes a result as a parameter
	 */
	onJobFinished(callback: (...args: any[]) => void): void {
		this.callbacks.push(callback);
	}

	private async processJobs(): Promise<void> {
		this.isProcessing = true;

		// Get the next batch of jobs to process
		const jobsToProcess = this.jobQueue.splice(0, this.parallel);

		// Start processing the jobs in parallel
		debug(`Starting to process ${jobsToProcess.length} jobs in parallel`);
		const promises = jobsToProcess.map(async job => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const result: any = await job();
			for (const callback of this.callbacks) {
				callback(result);
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return result;
		});
		promises.forEach(async promise => {
			// @ts-expect-error - This is a hack to make sure the promise is not resolved before the job is done
			promise.done = false;
			promise.finally(() => {
				// @ts-expect-error - This is a hack to make sure the promise is not resolved before the job is done
				promise.done = true;
			});
		});

		// Keep processing jobs as long as there are jobs in the queue
		while (this.jobQueue.length > 0) {
			// Check if we can start a new job
			while (promises.length < this.parallel && this.jobQueue.length > 0) {
				const job = this.jobQueue.shift();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
				const promise: Promise<any> = job!().then((result: any) => {
					for (const callback of this.callbacks) {
						callback(result);
					}

					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return result;
				});

				// @ts-expect-error - This is a hack to make sure the promise is not resolved before the job is done
				promise.done = false;
				promise.finally(() => {
					// @ts-expect-error - This is a hack to make sure the promise is not resolved before the job is done
					promise.done = true;
				});
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				promises.push(promise);
				debug(
					`Starting a new job (inprogress: ${promises.length}, total: ${this.jobQueue.length})`,
				);
			}

			// Wait for the next job to finish
			await Promise.race(promises); // eslint-disable-line no-await-in-loop

			// @ts-expect-error - This is a hack to make sure the promise is not resolved before the job is done
			const index = promises.findIndex(p => p.done);
			promises.splice(index, 1);
			debug(
				`Job finished (inprogress: ${promises.length}, total: ${this.jobQueue.length})`,
			);
		}

		// Wait for all remaining jobs to finish
		await Promise.allSettled(promises);

		this.isProcessing = false;
	}
}
