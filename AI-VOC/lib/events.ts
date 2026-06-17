import { EventEmitter } from "events";

type PipelineEventType = "fetch" | "classify" | "aggregate" | "insight" | "done" | "error";

class PipelineEvents extends EventEmitter {
  emitEvent(reportId: string, event: PipelineEventType, data: Record<string, unknown>) {
    return super.emit(`${reportId}:${event}`, { type: event, ...data });
  }

  subscribe(reportId: string, cb: (event: Record<string, unknown>) => void) {
    const events: PipelineEventType[] = ["fetch", "classify", "aggregate", "insight", "done", "error"];
    const unsubscribers = events.map((event) => {
      const handler = (payload: Record<string, unknown>) => cb(payload);
      this.on(`${reportId}:${event}`, handler);
      return () => this.off(`${reportId}:${event}`, handler);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }
}

export const pipelineEvents = new PipelineEvents();
