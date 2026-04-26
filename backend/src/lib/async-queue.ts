type Task = () => Promise<void>;

class AsyncQueue {
  private queue: Task[] = [];
  private running = false;

  enqueue(task: Task): void {
    this.queue.push(task);
    if (!this.running) this.process();
  }

  private async process(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error('Queue task error:', err);
      }
    }
    this.running = false;
  }
}

export const embeddingQueue = new AsyncQueue();