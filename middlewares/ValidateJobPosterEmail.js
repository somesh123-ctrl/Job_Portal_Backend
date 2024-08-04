module.exports = (req, res, next) => {
    const { userType, email } = req.body;
    
    if (userType === 'jobPoster') {
        const emailDomain = email.split('@')[1];
        
        if (!emailDomain || !emailDomain.endsWith('companyname.com')) {
            return res.status(400).json({ error: 'Email must end with @companyname.com' });
        }
    }
    
    next();
};
