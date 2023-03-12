import JobQueue, {type Job} from '.';

describe('JobQueue', () => {
	describe('add', () => {
		it.skip('should add a job to the queue', async () => {
			const jobQueue = new JobQueue({parallel: 1});
			const job: Job = async () => 'job1';

			jobQueue.add(job);

			expect(jobQueue.pending).toBe(1);

			await jobQueue.wait();
		});

		it('should not add the same job twice', async () => {
			const jobQueue = new JobQueue({parallel: 1});
			const job: Job = async () => 'job1';

			jobQueue.add(job);
			jobQueue.add(job);

			expect(jobQueue.pending).toBe(1);

			await jobQueue.wait();
		});
	});

	describe('wait', () => {
		it('should wait for all jobs to finish', async () => {
			const jobQueue = new JobQueue({parallel: 1});
			const job1: Job = async () => 'job1';
			const job2: Job = async () => 'job2';
			const job3: Job = async () => 'job3';

			jobQueue.add(job1);
			jobQueue.add(job2);
			jobQueue.add(job3);

			await jobQueue.wait();

			expect(jobQueue.pending).toBe(0);
		});
	});

	describe('on', () => {
		it('should call the callback when a job is finished', async () => {
			const jobQueue = new JobQueue({parallel: 1});
			const job: Job = async () => 'job1';
			const callback = jest.fn();

			jobQueue.onJobFinished(callback);
			jobQueue.add(job);

			await jobQueue.wait();

			expect(callback).toHaveBeenCalledWith('job1');
		});
	});

	describe('parallel', () => {
		it('should process jobs in parallel', async () => {
			const jobQueue = new JobQueue({parallel: 2});
			const job1: Job = async () =>
				new Promise(resolve => {
					setTimeout(() => {
						resolve('job1');
					}, 100);
				});
			const job2: Job = async () =>
				new Promise(resolve => {
					setTimeout(() => {
						resolve('job2');
					}, 200);
				});
			const job3: Job = async () =>
				new Promise(resolve => {
					setTimeout(() => {
						resolve('job3');
					}, 300);
				});

			jobQueue.add(job1);
			jobQueue.add(job2);
			jobQueue.add(job3);

			const startTime = Date.now();

			await jobQueue.wait();

			const endTime = Date.now();

			// All jobs should finish in less than 400ms since the first two jobs run in parallel
			expect(endTime - startTime).toBeLessThan(400);
		});
	});
});
