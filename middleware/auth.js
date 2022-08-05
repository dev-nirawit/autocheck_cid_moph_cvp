const jwt = require("jsonwebtoken");

const config = process.env;

const verifyToken = (req, res, next) => {
    const token =
        req.body.token || req.query.token || req.headers["auth-token"];

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log("your IP is: " + ip);
    if (!token) {
        return res.status(403).send({
            ok: false,
            status_color: "no auth",
            message: `คุณยังไม่ได้ เข้าสู่ระบบ`
        });
    }
    try {
        const decoded = jwt.verify(token, config.JWT_KEY);
        req.user = decoded;
    } catch (err) {
        return res.status(401).send("Invalid Token");
    }
    return next();
};

module.exports = verifyToken;