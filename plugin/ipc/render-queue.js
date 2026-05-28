function createRenderQueue(initialJobs = []) {
    const now = () => new Date().toISOString();
    let jobs = Array.isArray(initialJobs)
        ? initialJobs.map(job => {
            if (job?.status === 'rendering') {
                return {
                    ...job,
                    status: 'interrupted',
                    error: job.error || 'Render was interrupted before completion.',
                    updatedAt: now()
                };
            }
            return { ...job };
        })
        : [];
    return {
        enqueue(job = {}) {
            const next = {
                id: job.id || `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                status: 'queued',
                attempts: 0,
                createdAt: now(),
                updatedAt: now(),
                ...job
            };
            jobs.push(next);
            return next;
        },
        start(id) {
            jobs = jobs.map(job => job.id === id ? { ...job, status: 'rendering', attempts: Number(job.attempts || 0) + 1, updatedAt: now() } : job);
            return jobs.find(job => job.id === id) || null;
        },
        complete(id, result = {}) {
            jobs = jobs.map(job => job.id === id ? { ...job, status: 'done', result, updatedAt: now() } : job);
            return jobs.find(job => job.id === id) || null;
        },
        fail(id, error) {
            jobs = jobs.map(job => job.id === id ? { ...job, status: 'failed', error: String(error || 'Render failed'), updatedAt: now() } : job);
            return jobs.find(job => job.id === id) || null;
        },
        cancel(id) {
            jobs = jobs.map(job => ['queued', 'rendering'].includes(job.status) && job.id === id
                ? { ...job, status: 'canceled', updatedAt: now() }
                : job);
            return jobs.find(job => job.id === id) || null;
        },
        retry(id) {
            jobs = jobs.map(job => job.id === id && ['failed', 'canceled', 'interrupted'].includes(job.status)
                ? { ...job, status: 'queued', error: null, updatedAt: now() }
                : job);
            return jobs.find(job => job.id === id) || null;
        },
        clearCompleted() {
            const before = jobs.length;
            jobs = jobs.filter(job => !['done', 'failed', 'canceled', 'interrupted'].includes(job.status));
            return before - jobs.length;
        },
        list() {
            return jobs.map(job => ({ ...job }));
        }
    };
}

module.exports = { createRenderQueue };
