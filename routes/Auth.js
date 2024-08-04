const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { JobSeeker, JobPoster } = require('../models/User');
const Job = require('../models/Job');
const JobApplication = require('../models/JobApplication');
const auth = require('../middlewares/Auth');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
// Configure multer for file uploads with destination and filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to avoid naming conflicts
  }
});
const upload = multer({ storage: storage });
// User signup
router.post('/signup', async (req, res) => {
  const { userType, name, email, password, companyName, companyType } = req.body;
  try {
    let existingUser = await JobSeeker.findOne({ email }) || await JobPoster.findOne({ email });
    if (existingUser) {
      return res.status(400).send('User already registered');
    }

    let user;
    if (userType === 'jobPoster') {
      user = new JobPoster({ name, email, password, companyName, companyType });
    } else {
      user = new JobSeeker({ name, email, password });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();
    res.status(201).send(user);
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).send('Server error');
  }
});

// User login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await JobSeeker.findOne({ email }) || await JobPoster.findOne({ email });

    if (!user) {
      return res.status(400).send('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send('Invalid credentials');
    }

    const payload = {
      user: {
        id: user.id,
        userType: user.userType
      }
    };

    jwt.sign(payload, 'secret', { expiresIn: '1h' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userType: user.userType
        }
      });
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await JobPoster.findById(req.user.id) || await JobSeeker.findById(req.user.id);
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).send('Server error');
  }
});

// Route to update user profile (including resume and profile picture upload)
router.post('/profile', [auth, upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'profilePicture', maxCount: 1 }])], async (req, res) => {
  const { highestQualification, interestedRole, skillset } = req.body;
  try {
    const user = await JobSeeker.findById(req.user.id);
    if (!user) {
      return res.status(404).send('User not found');
    }

    if (highestQualification) user.highestQualification = highestQualification;
    if (interestedRole) user.interestedRole = interestedRole;
    if (skillset) user.skillset = skillset.split(',');

    if (req.files.resume) user.resume = req.files.resume[0].filename; // Save only the filename
    if (req.files.profilePicture) user.profilePicture = req.files.profilePicture[0].filename; // Save only the filename

    await user.save();
    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch applicant details by ID
router.get('/applicant-details/:applicantId', auth, async (req, res) => {
  try {
    const applicant = await JobSeeker.findById(req.params.applicantId);
    if (!applicant) {
      return res.status(404).send('Applicant not found');
    }
    res.json(applicant);
  } catch (error) {
    console.error('Error fetching applicant details:', error);
    res.status(500).send('Server error');
  }
});

// Serve resume file
router.get('/resume/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads', filename);

  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// Route to post a job
router.post('/post-job', auth, async (req, res) => {
  const { jobRole, companyName, salary, skillsRequired } = req.body;
  try {
    const user = await JobPoster.findById(req.user.id);
    if (!user) {
      return res.status(403).send('Only job posters can post jobs');
    }

    const newJob = new Job({
      jobRole,
      companyName,
      salary,
      skillsRequired,
      postedBy: user.id
    });

    await newJob.save();
    res.status(201).send(newJob);
  } catch (error) {
    console.error('Error posting job:', error);
    res.status(500).send('Server error');
  }
});

// Route to apply for a job
router.post('/apply-job/:jobId', auth, async (req, res) => {
  const { jobId } = req.params;
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).send('Job not found');
    }

    const existingApplication = await JobApplication.findOne({
      job: jobId,
      applicant: req.user.id
    });

    if (existingApplication) {
      return res.status(400).send('You have already applied for this job');
    }

    const application = new JobApplication({
      job: jobId,
      applicant: req.user.id
    });

    await application.save();

    // Update the Job document to include this application
    await Job.findByIdAndUpdate(jobId, {
      $push: { jobApplications: application._id }
    });

    res.status(201).send('Application submitted successfully');
  } catch (error) {
    console.error('Error applying for job:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch applied jobs for a logged-in job seeker
router.get('/applied-jobs', auth, async (req, res) => {
  try {
    const applications = await JobApplication.find({ applicant: req.user.id }).populate('job');
    const appliedJobs = applications.map(application => application.job._id);
    res.json(appliedJobs);
  } catch (error) {
    console.error('Error fetching applied jobs:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch detailed applied jobs for a logged-in job seeker
router.get('/detailed-applied-jobs', auth, async (req, res) => {
  try {
    const applications = await JobApplication.find({ applicant: req.user.id }).populate('job');
    const detailedAppliedJobs = applications.map(application => {
      const { job } = application;
      return {
        _id: job._id,
        jobRole: job.jobRole,
        companyName: job.companyName,
        salary: job.salary,
        skillsRequired: job.skillsRequired,
        status: application.status,
        appliedAt: application.appliedAt
      };
    });
    res.json(detailedAppliedJobs);
  } catch (error) {
    console.error('Error fetching detailed applied jobs:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch job history for job poster
router.get('/jobs-history', auth, async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.id })
      .populate({
        path: 'jobApplications',
        populate: {
          path: 'applicant',
          select: 'name email'
        }
      })
      .exec();
    res.json(jobs);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Route to fetch all jobs with filters and sorting
router.get('/all-jobs', async (req, res) => {
  try {
    const { salaryRange, jobRole, sortOrder } = req.query;

    let filter = {};
    if (salaryRange) {
      const [min, max] = salaryRange.split('-').map(Number);
      filter.salary = { $gte: min, $lte: max };
    }
    if (jobRole) {
      filter.jobRole = new RegExp(jobRole, 'i');
    }

    let sort = {};
    if (sortOrder) {
      const [field, order] = sortOrder.split('-');
      sort[field] = order === 'asc' ? 1 : -1;
    }

    const jobs = await Job.find(filter).sort(sort);
    res.json(jobs);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Route to fetch applications for a specific job
router.get('/view-applications/:jobId', auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).populate({
      path: 'jobApplications',
      populate: {
        path: 'applicant',
        select: 'name email highestQualification interestedRole skillset resume'
      }
    });
    if (!job) {
      return res.status(404).send('Job not found');
    }
    res.json(job.jobApplications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch job details by ID
router.get('/job-details/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).send('Job not found');
    }
    res.json(job);
  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).send('Server error');
  }
});

// Route to fetch dashboard data
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.id;
  
    // Fetch number of jobs posted
    const jobsPosted = await Job.countDocuments({ postedBy: userId });
  
    // Fetch total number of applications received for all jobs posted
    const jobs = await Job.find({ postedBy: userId }).populate('jobApplications');
    const applicationsReceived = jobs.reduce((total, job) => total + job.jobApplications.length, 0);
  
    // Fetch top performing job
    const topJob = await Job.findOne({ postedBy: userId })
      .sort({ 'jobApplications.length': -1 })
      .limit(1);
    const topJobTitle = topJob ? topJob.jobRole : 'N/A';
  
    // Fetch average response time (dummy calculation)
    const responseTimes = jobs.flatMap(job => 
      job.jobApplications.map(app => (new Date() - new Date(app.createdAt)) / (1000 * 60 * 60 * 24)) // days
    );
    const avgResponseTime = responseTimes.length > 0 
      ? `${Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)} days`
      : 'N/A';
  
    res.json({
      jobsPosted,
      applicationsReceived,
      topJob: topJobTitle,
      averageResponseTime: avgResponseTime
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Server error');
  }
});

// Route to update job application status
router.put('/update-application-status/:applicationId', auth, async (req, res) => {
  const { status } = req.body;

  if (!['Applied', 'Interviewed', 'Rejected', 'Hired'].includes(status)) {
    return res.status(400).send('Invalid status');
  }

  try {
    const application = await JobApplication.findById(req.params.applicationId);

    if (!application) {
      return res.status(404).send('Application not found');
    }

    application.status = status;
    await application.save();

    res.json(application);
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).send('Server error');
  }
});





module.exports = router;
