const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const jobSeekerSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { type: String, default: 'jobSeeker' },
  highestQualification: { type: String },
  interestedRole: { type: String },
  resume: { type: String },
  profilePicture: { type: String },
  skillset: [{ type: String }]  // Array of strings to store skillset
});

const jobPosterSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  companyName: { type: String, required: true },
  companyType: { type: String, required: true },
  userType: { type: String, default: 'jobPoster' }
});

const JobSeeker = mongoose.model('JobSeeker', jobSeekerSchema);
const JobPoster = mongoose.model('JobPoster', jobPosterSchema);

module.exports = { JobSeeker, JobPoster };
