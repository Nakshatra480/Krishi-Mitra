const mongoose = require('mongoose');

const AdvisorySchema = new mongoose.Schema(
  {
    proposedAction: String,
    challengerObjection: String,
    finalAction: {
      type: String,
      enum: ['APPLY', 'WAIT', 'HOLD', 'HARVEST', 'NONE'],
      default: 'NONE',
    },
    decisionReason: String,
    validatorPassed: { type: Boolean, default: true },
    // True only when the challenger's objection actually changed the action.
    // An objection discarded below threshold is noted, not shown as a block.
    objectionApplied: { type: Boolean, default: false },
  },
  { _id: false }
);

const EventSchema = new mongoose.Schema(
  {
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'STAGE_CHANGE',
        'HEAVY_RAIN',
        'HEAT_STRESS',
        'DRY_SPELL',
        'FERTILIZER_WINDOW',
        'HAZARD_ALERT',
        'YIELD_SHIFT',
        'HARVEST_WINDOW',
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    advisory: { type: AdvisorySchema, default: () => ({}) },
    read: { type: Boolean, default: false, index: true },
    // Mongoose makes a timestamps-managed createdAt immutable, which would
    // silently discard the bump when a repeated check refreshes an existing
    // event. The timeline sorts on this field, so a refreshed event has to be
    // able to move back to the top.
    createdAt: { type: Date, immutable: false },
  },
  { timestamps: true }
);

EventSchema.index({ userId: 1, read: 1 });
EventSchema.index({ fieldId: 1, createdAt: -1 });

module.exports = mongoose.model('Event', EventSchema);
