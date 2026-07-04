import type { Span } from '@sentry/core';
import type { ReplayContainer } from '../types';
type AfterSegmentSpanEndCallback = (segmentSpan: Span) => void;
export declare function handleAfterSegmentSpanEnd(replay: ReplayContainer): AfterSegmentSpanEndCallback;
export {};
//# sourceMappingURL=handleAfterSegmentSpanEnd.d.ts.map