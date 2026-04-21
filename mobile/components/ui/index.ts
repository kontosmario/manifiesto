// Phase 2 primitives — barrel.
// Existing Phase 1 primitives remain imported by explicit path per the codebase convention.
// Add re-exports here as new primitives land.

export { AnimatedAmount } from './animated-amount'
export { formatAnimatedAmount, type AmountPrefix } from './animated-amount-format'

export { BottomSheet, type BottomSheetHandle } from './bottom-sheet'

export { CategoryBadge, type CategoryBadgeSize, type CategoryBadgeTone } from './category-badge'

export { InputGroup } from './input-group'

export { SkeletonBox } from './skeleton-box'
export {
  HeroSkeleton,
  MetricStripSkeleton,
  ListRowSkeleton,
  CardSkeleton,
  SKELETON_HERO_LAYOUT,
  SKELETON_LIST_ROW_LAYOUT,
  SKELETON_METRIC_LAYOUT,
} from './skeleton-layouts'

export { StickyFooter } from './sticky-footer'
