import type { SegmentAxis, SegmentValue } from '../../types/strategic';

export type SegmentResponse = {
  id: string;
  label: string;
  code: string;
  values: Array<SegmentValue>;
};

export type SegmentValueResponse = SegmentValue;

export const mapSegment = (segment: SegmentResponse): SegmentAxis => ({
  id: segment.id,
  label: segment.label,
  code: segment.code,
  values: segment.values.map((value) => ({
    id: value.id,
    value: value.value,
    code: value.code
  }))
});
