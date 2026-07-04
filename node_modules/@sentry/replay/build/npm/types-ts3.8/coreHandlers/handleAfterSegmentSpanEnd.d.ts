import { Span } from '@sentry/core';
import { ReplayContainer } from '../types';
type AfterSegmentSpanEndCallback = (segmentSpan: Span) => void;
export declare function handleAfterSegmentSpanEnd(replay: ReplayContainer): AfterSegmentSpanEndCallback;
export {};
//# sourceMappingURL=handleAfterSegmentSpanEnd.d.ts.map
