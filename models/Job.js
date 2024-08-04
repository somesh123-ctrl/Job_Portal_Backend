const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  jobRole: { type: String, required: true },
  companyName: { type: String, required: true },
  salary: { type: Number, required: true },
  skillsRequired: { type: [String], required: true },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobPoster',
    required: true
  },
  createdAt: { type: Date, default: Date.now },
  jobApplications: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication' }]
});

module.exports = mongoose.model('Job', jobSchema);
