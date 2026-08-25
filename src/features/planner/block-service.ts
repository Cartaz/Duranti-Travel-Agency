import { plannerApplication } from '../../composition/planner'
import type {
  BasicPlannerBlockType,
  ChecklistItemDraft,
  PlannerBlockDraft,
  PlannerBlockType,
} from '../../application/planner/planner-application'
import type { BlockMoveDirection } from '../../application/planner/ports'

export type {
  BasicPlannerBlockType,
  ChecklistItemDraft,
  PlannerBlockDraft,
  PlannerBlockType,
  BlockMoveDirection,
}

// S1 compatibility seam while planner pages move to ApplicationProvider.
export const assertPlannerDayContext = plannerApplication.assertPlannerDayContext
export const listDayPlannerBlocks = plannerApplication.listDayPlannerBlocks
export const readPlannerBlockDraft = plannerApplication.readPlannerBlockDraft
export const createPlannerBlock = plannerApplication.createPlannerBlock
export const updatePlannerBlock = plannerApplication.updatePlannerBlock
export const movePlannerBlock = plannerApplication.movePlannerBlock
export const deletePlannerBlock = plannerApplication.deletePlannerBlock
