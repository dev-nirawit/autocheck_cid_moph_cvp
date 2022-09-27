"use strict";

require("dotenv").config();
// const Knex = require('knex');
// const crypto = require('crypto');
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const HttpStatus = require("http-status-codes");
const axios = require("axios");
const https = require("https");
// const CronJob = require("cron").CronJob;
const moment = require("moment");
const fs = require("fs");
const jwt_decode = require('jwt-decode');
const jwt = require('jsonwebtoken');
var _token = "";

// @ts-ignore
axios.defaults.baseURL = process.env.URL_API;
const model = require("./model/model");
const modelAuth = require("./model/auth");
const app = express();
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

var dbHIS = require("knex")({
    client: "mysql",
    connection: {
        host: process.env.DB_HIS_HOST,
        user: process.env.DB_HIS_USER,
        port: +process.env.DB_HIS_PORT,
        password: process.env.DB_HIS_PASSWORD,
        database: process.env.DB_HIS_NAME,
        insecureAuth: true
    },
    pool: {
        min: 0,
        max: 100,
        afterCreate: (conn, done) => {
            conn.query("SET NAMES utf8", err => {
                done(err, conn);
            });
        }
    }
});

var db = require("knex")({
    client: "mysql",
    connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        port: +process.env.DB_PORT,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        insecureAuth: true
    },
    pool: {
        min: 0,
        max: 100,
        afterCreate: (conn, done) => {
            conn.query("SET NAMES utf8", err => {
                done(err, conn);
            });
        }
    }
});

const auth = require("./middleware/auth");
const req = require("express/lib/request");
const res = require("express/lib/response");

// @ts-ignore
app.get("/", (req, res) =>
    res.send({
        ok: true,
        message: "Welcome to my api server!",
        code: HttpStatus.OK
    })
);

app.post("/login", async(req, res) => {
    var username = req.body.data.username
    var password = req.body.data.password
    try {
        // console.log(data);
        let rs = await modelAuth.login(dbHIS, username, password);
        // console.log(rs[0]);
        const token = jwt.sign({ username: username, name: rs[0][0].name },
            process.env.JWT_KEY, {
                expiresIn: "1d",
            }
        );
        if (rs[0].length == 1) {
            await getToken();
            res.send({
                ok: true,
                data: rs[0][0],
                token: token
            });
        } else {
            res.send({
                ok: false,
                message: 'username , password ผิดพลาด!'
            });
        }

    } catch (error) {
        res.send({ ok: false, rows: error });

    }
})

// app.get('/get_token', async(req, res) => {
//     const rs = await axios.get(
//         `/token?Action=get_moph_access_token&${process.env.CVP_MOPH_ACCESS_TOKEN}`, {
//             httpsAgent: new https.Agent({
//                 rejectUnauthorized: false
//             })
//         }
//     );

//     if (rs.status == 200) {
//         _token = rs.data;
//         res.send({ code: rs.status });
//     } else {
//         res.send({ code: rs.status });
//     }

// });

app.get('/get_nationality', auth, async(req, res) => {
    const rs = await model.getNationality(dbHIS);
    // console.log(rs);
    if (rs.length > 0) {
        res.send({
            ok: true,
            data: rs,
        });
    } else {
        res.send({
            ok: false,
            message: 'ไม่พบข้อมูล!'
        });
    }

});

app.get("/check/:cid", auth, async(req, res) => {
    var cid = req.params.cid;
    try {
        // @ts-ignore
        await checkToken();
        const patient = await checkHN(cid);
        await axios.get(`/api/ImmunizationHistory?cid=${cid}`, {
                headers: {
                    Authorization: `Bearer ${_token}`
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            }).then(async(response) => {
                // console.log('response', response)
                if (response.data.result.vaccine_certificate) {
                    if (patient) {
                        let data_sticker = await dataSticker(patient.hn, response.data.result.vaccine_certificate[0].vaccination_list)
                        res.send({ api_data: response.data, patient: patient, data_sticker });
                    } else {
                        res.send({ api_data: response.data });
                    }
                } else {
                    // console.log('else')
                    patient ?
                        res.send({ api_data: response.data, patient: patient }) :
                        res.send({ api_data: response.data });
                }
            })
            .catch(function(error) {
                res.send(error.response.data);
                // console.log(error.response.data)
                // res.send({ ok: false, rows: error });
            })

        // res.send(response);
    } catch (error) {
        // Handle Error Here
        res.send({ ok: false, rows: error });
    }
});

app.get("/get_cid_from_passport/:passport_no/:nationality", auth, async(req, res) => {
    var passport_no = req.params.passport_no;
    var nationality = req.params.nationality;
    try {
        await checkToken();
        await axios.get(`/api/GetCIDFromPassportNumber?passport_number=${passport_no}&nationality=${nationality}`, {
            headers: {
                Authorization: `Bearer ${_token}`
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        }).then(function(response) {
            // console.log(response)
            res.send(response.data);
        })
    } catch (error) {
        res.send({ MessageCode: 400, rows: error });
    }
});

app.post("/send-message-to-user", auth, async(req, res) => {
    var data = req.body
    try {
        var data_rs = [];
        await checkToken();
        const response = await axios.post(`/api/SendMessageTarget`, data, {
            headers: {
                Authorization: `Bearer ${_token}`
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        console.log('res', response);
        if (response.data) {
            await data_rs.push({
                ok: true,
                status: true,
                status_color: "success",
                text: `ส่งการแจ้งเตือน สำเร็จ`
            });
        } else {
            await data_rs.push({
                ok: true,
                status: false,
                status_color: "error",
                text: `ส่งการแจ้งเตือน ไม่สำเร็จ`
            });
        }
        res.send(data_rs);

    } catch (error) {
        res.send({ ok: false, rows: error });
    }
})

app.get("/check-cvp-moph-todb/:cid", auth, async(req, res) => {
    var cid = req.params.cid;
    try {
        var data_rs = [];
        // await getToken();
        await checkToken();
        const patient = await checkHN(cid) || '';

        console.log("cid:" + cid);
        // @ts-ignore
        await axios.get(`/api/ImmunizationHistory?cid=${cid}`, {
                headers: {
                    Authorization: `Bearer ${_token}`
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            }).then(async(response) => {
                // console.log(response.data.result)
                if (response.data.result.vaccine_certificate) {

                    var i = 0;
                    for await (const v of response.data.result.patient.visit) {
                        const a = v.visit_immunization[0].vaccine_ref_name.indexOf("[");
                        const b = v.visit_immunization[0].vaccine_ref_name.indexOf("]");
                        const strVaccine_ref_name = v.visit_immunization[0].vaccine_ref_name.substring(
                            a + 1,
                            b
                        );
                        // console.log(`moph_vaccine_ref_name: ${v.visit_immunization[0].vaccine_ref_name} | Vaccine_ref_name: ${strVaccine_ref_name}`);
                        let dose_no = ++i;
                        const manufacturer_id =
                            (await getVaccineManufacturerID(strVaccine_ref_name)) || null;
                        const data = await {
                            cid: cid,
                            vaccine_dose_no: dose_no,
                            visit_datetime: v.visit_datetime,
                            vaccine_name: v.visit_immunization[0].vaccine_ref_name,
                            vaccine_manufacturer_id: manufacturer_id,
                            vaccine_lot_number: v.visit_immunization[0].lot_number,
                            hospital_code: v.hospital_code,
                            hospital_name: v.hospital_name,
                            visit_guid: v.visit_guid,
                            immunization_datetime: v.visit_immunization[0].immunization_datetime
                        };
                        const ck = await checkInsertDataHistory(cid, dose_no);
                        // console.log(ck.length);
                        if (ck.length == 0) {
                            await data_rs.push({
                                ok: true,
                                MessageCode: 200,
                                status: true,
                                status_color: "success",
                                Message: `Update แล้ว DOSE[${dose_no}] {${strVaccine_ref_name} - ${moment(v.visit_datetime).format("DD/MM/YYYY HH:mm:ss")}(${v.hospital_name})}`,
                                // StatusDB: 'insert',
                            });
                            log("[UPDATE] CID: " + cid);
                            await model.insertDataHistory(dbHIS, data);
                        } else {
                            await data_rs.push({
                                ok: true,
                                MessageCode: 201,
                                status: false,
                                status_color: "warning",
                                Message: `ข้อมูลนี้ Update ไปแล้ว DOSE[${dose_no}] {${strVaccine_ref_name} - ${moment(v.visit_datetime).format("DD/MM/YYYY HH:mm:ss")}(${v.hospital_name})}`,
                                // StatusDB: 'update',
                            });
                            // data_rs.push({a:1})
                            // console.log(data_rs)
                            log(`[NO UPDATE] CID & DOSE Duplicate ${cid}[${dose_no}] {${strVaccine_ref_name} - ${moment(v.visit_datetime).format("DD/MM/YYYY HH:mm:ss")}(${v.hospital_name})}`);
                        }
                    }
                }
                // else if (response.data.result.vaccine_certificate && response.data.result.patient !== null) {
                //     await data_rs.push({
                //         ok: true,
                //         MessageCode: 501,
                //         status: false,
                //         status_color: "warning",
                //         Message: `ไม่พบข้อมูลการได้รับวัคซีน CID นี้`
                //     });
                //     log("ไม่พบข้อมูลการได้รับวัคซีน CID :" + cid, false);
                // } 
                else {
                    await data_rs.push({
                        ok: true,
                        MessageCode: 501,
                        status: false,
                        status_color: "error",
                        Message: `ไม่พบข้อมูลการได้รับวัคซีน CID นี้`
                    });
                    log("ไม่พบ CID:" + cid, false);
                }
                // const data = await checkImmunizationHistoryCID(cid);
                // console.log(data_rs);
                // res.send({ data_update: data_rs, result: response.data.result })
                let data_sticker = {};
                typeof object === 'object' && Boolean(response.data.result.vaccine_certificate.length) ?
                    await dataSticker(patient.hn, response.data.result.vaccine_certificate[0].vaccination_list) : {};
                res.send({ data_rs: data_rs, api_data: response.data, patient: patient, data_sticker: data_sticker });
            })
            .catch(function(error) {
                console.log("axios error");
                console.log(error)
                data_rs.push({
                    ok: true,
                    MessageCode: 501,
                    status: false,
                    status_color: "error",
                    Message: `ไม่พบข้อมูลการได้รับวัคซีน CID นี้`
                });
                // res.send({ data_rs: data_rs, api_data: error.response.data });
                res.send({ data_rs: data_rs, api_data: error });
            });
    } catch (error) {
        // Handle Error Here
        console.log("error", error);
        data_rs.push({
            ok: true,
            MessageCode: 501,
            status: false,
            status_color: "error",
            Message: `ไม่พบข้อมูลการได้รับวัคซีน CID นี้`
        });
        // res.send({ data_rs: data_rs, api_data: error.response.data });
        res.send({ data_rs: data_rs, api_data: error });
    }
});

app.get('/check_label_code/:label_code', auth, async(req, res) => {
    var label_code = req.params.label_code;
    try {
        const result = await model.getVaccineInventoryLabel(dbHIS, label_code);
        if (result[0].length > 0) {
            res.send({ ok: true, result: result[0] });
        } else {
            res.send({ ok: false, message: 'ไม่พบข้อมูล' });
        }
    } catch (error) {
        res.send({ ok: false, message: error });
    }
});

app.get('/del_label_code/:label_code', auth, async(req, res) => {
    var label_code = req.params.label_code;
    try {
        const result = await model.setNullVaccineInventoryLabel(dbHIS, label_code);
        console.log(result);
        if (result) {
            res.send({ ok: true });
        } else {
            res.send({ ok: false, message: `ไม่พบ label_code[${label_code}] นี้!` });
        }
    } catch (error) {
        res.send({ ok: false, message: error });
    }
});


function log(text, log = true) {
    var _text = `${moment().format("DD-MM-YYYY HH:mm:ss")} - ${text}`;
    // fs.appendFileSync('./log.log', `${_text}\n`);
    if (log && (process.env.NODE_ENV !== "development")) {
        fs.appendFileSync("./log.log", `${_text}\n`);
    }
    console.log(_text);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getToken() {
    // @ts-ignore
    const rs = await axios.get(
        `/token?Action=get_moph_access_token&${process.env.CVP_MOPH_ACCESS_TOKEN}`, {
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        }
    );
    _token = rs.data;
    log(`[GET Token]` + _token);
}

async function checkToken() {
    // console.log('_token:' + _token);
    if (_token != "") {
        // @ts-ignore
        const decodeJWT = jwt_decode(_token);
        var currentTimestamp = new Date().getTime() / 1000;
        // var tokenIsNotExpired = decodeJWT.exp > currentTimestamp;
        if (decodeJWT.exp < currentTimestamp) {
            // console.log(`JWT Expired tokenIsNotExpired=${tokenIsNotExpired},ecodeJWT.exp=${ecodeJWT.exp} | currentTimestamp=${currentTimestamp}`)
            log(`JWT=${_token} ,ecodeJWT.exp=${decodeJWT.exp} | currentTimestamp=${currentTimestamp}`)
            await getToken();
        }
    } else {
        log('NO JWT');
        await getToken();
    }
}

async function checkImmunizationHistoryCID(cid) {
    try {
        // @ts-ignore
        await delay(process.env.URL_API_CALL_DELAY_MS);
        // @ts-ignore
        const response = await axios.get(`/api/ImmunizationHistory?cid=${cid}`, {
            headers: {
                Authorization: `Bearer ${_token}`
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        if (response.data.result.vaccine_certificate.length > 0) {
            // await model.updateStatus(db, cid)
            // console.log('result', response.data.result.patient.visit);
            response.data.result.patient.visit.forEach(async(v, i) => {
                const a = v.visit_immunization[0].vaccine_ref_name.indexOf("[");
                const b = v.visit_immunization[0].vaccine_ref_name.indexOf("]");
                const strVaccine_ref_name = v.visit_immunization[0].vaccine_ref_name.substring(
                    a + 1,
                    b
                );
                // console.log(`moph_vaccine_ref_name: ${v.visit_immunization[0].vaccine_ref_name} | Vaccine_ref_name: ${strVaccine_ref_name}`);
                let dose_no = ++i;
                const manufacturer_id =
                    (await getVaccineManufacturerID(strVaccine_ref_name)) || null;
                const data = await {
                    cid: cid,
                    vaccine_dose_no: dose_no,
                    visit_datetime: v.visit_datetime,
                    vaccine_name: v.visit_immunization[0].vaccine_ref_name,
                    vaccine_manufacturer_id: manufacturer_id,
                    vaccine_lot_number: v.visit_immunization[0].lot_number,
                    hospital_code: v.hospital_code,
                    hospital_name: v.hospital_name,
                    visit_guid: v.visit_guid,
                    immunization_datetime: v.visit_immunization[0].immunization_datetime
                };
                // console.log(`v.visit_immunization[0].vaccine_ref_name : ${v.visit_immunization[0].vaccine_ref_name.substring(a+1,b)}`);
                // console.log(data);
                const ck = await checkInsertDataHistory(cid, dose_no);
                // console.log(ck.length);
                if (ck.length == 0) {
                    log("[UPDATE] CID: " + cid);
                    await model.insertDataHistory(dbHIS, data);
                } else {
                    log(`[NO UPDATE] CID & DOSE Duplicate ${cid}[${dose_no}]`);
                }
            });
        } else {
            log("[NO UPDATE] CID:" + cid, false);
        }
        return response.data.result;
    } catch (error) {
        await checkToken();
        log("[ERROR]" + error);
    }
}

async function getList() {
    log("[START] getList...", false);
    const rs = await model.getList(dbHIS);
    log("[getList] Patient COUNT: " + rs.length);
    var i = 0;
    for await (const v of rs) {
        i = i + 1;
        log(`index loop : ${i}  [CID] : ${v.cid}`, false);
        await checkImmunizationHistoryCID(v.cid);
    }
    log("[END] getList...", false);
    await getVaccineBooking(process.env.TABLE_MULTIPLE);
}

// async function getVaccineBookingTravel() {
//     log('[START] getVaccineBookingTravel...', false);
//     const rs = await model.getVaccineBookingTravel(db)
//     log('[getVaccineBookingTravel] Patient COUNT: ' + rs.length);
//     var i = 0;
//     for await (const v of rs) {
//         i = i + 1;
//         log(`index loop : ${i}  [CID] : ${v.cid}`, false);
//         await checkImmunizationHistoryCID(v.cid);
//     }
//     log('[END] getVaccineBookingTravel...', false);
//     await getList();
// }

async function getVaccineBooking(table) {
    const listTable = table.split(",");
    try {
        // console.log(listTable);
        for await (const v of listTable) {
            log(`[START] TABLE[${v}]...`);
            const rs = await model.getDataFormTable(db, v);
            log("[COUNT] Patient: " + rs.length);
            var i = 0;
            for await (const d of rs) {
                i = i + 1;

                log(`index loop : ${i}  [CID] : ${eval('d.' + process.env.COLUMN_TABLE)} | Table[${v}]`);
                await checkImmunizationHistoryCID(eval('d.' + process.env.COLUMN_TABLE));
            }
            log(`[END] TABLE[${v}]...`);
        }
        // await getList();
    } catch (error) {
        console.log("error: " + error);
    }
}

async function getFixBug() {
    const rs = await model.getFixBug(dbHIS);
    log("[getFixBug] Patient COUNT: " + rs[0].length);
    var i = 0;
    for await (const v of rs[0]) {
        i = i + 1;
        log(`index loop : ${i}  [CID] : ${v.cid}`, false);
        // await checkImmunizationHistoryCID(v.cid);
        await updateFixBug(v.cid, v.vaccine_dose_no, v.moph_vaccine_history_id);
    }
    // await getList();
}

async function updateFixBug(cid, _vaccine_dose_no, moph_vaccine_history_id) {
    if (cid) {
        // @ts-ignore
        await delay(process.env.URL_API_CALL_DELAY_MS);
        // @ts-ignore
        const response = await axios.get(`/api/ImmunizationHistory?cid=${cid}`, {
            headers: {
                Authorization: `Bearer ${_token}`
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        if (response.data.result.vaccine_certificate.length > 0) {
            // await model.updateStatus(db, cid)
            // console.log('result', response.data.result.patient.visit);
            response.data.result.patient.visit.forEach(async(v, i) => {
                const a = v.visit_immunization[0].vaccine_ref_name.indexOf("[");
                const b = v.visit_immunization[0].vaccine_ref_name.indexOf("]");
                const strVaccine_ref_name = v.visit_immunization[0].vaccine_ref_name.substring(
                    a + 1,
                    b
                );
                // console.log(`moph_vaccine_ref_name: ${v.visit_immunization[0].vaccine_ref_name} | Vaccine_ref_name: ${strVaccine_ref_name}`);
                let dose_no = ++i;
                const manufacturer_id =
                    (await getVaccineManufacturerID(strVaccine_ref_name)) || null;
                const data = await {
                    cid: cid,
                    vaccine_dose_no: dose_no,
                    visit_datetime: v.visit_datetime,
                    vaccine_name: v.visit_immunization[0].vaccine_ref_name,
                    vaccine_manufacturer_id: manufacturer_id,
                    vaccine_lot_number: v.visit_immunization[0].lot_number,
                    hospital_code: v.hospital_code,
                    hospital_name: v.hospital_name,
                    visit_guid: v.visit_guid,
                    immunization_datetime: v.visit_immunization[0].immunization_datetime
                };
                if (_vaccine_dose_no == dose_no) {
                    await model.updateDataHistory(dbHIS, data, moph_vaccine_history_id);
                }
            })
        } else {
            log("[NO UPDATE] CID:" + cid, false);
        }
        return response.data.result;
    }
}

async function checkInsertDataHistory(cid, dose) {
    return await model.checkInsertDataHistory(dbHIS, cid, dose);
}

async function getVaccineManufacturerID(text) {
    try {
        const rs = await model.getVaccineManufacturerID(dbHIS, text);
        return rs[0].vaccine_manufacturer_id;
    } catch (error) {
        log("[WARNING]: " + error);
    }
}

async function checkHN(cid) {
    if (cid) {
        const rs = await model.getHNformCID(dbHIS, cid);
        if (rs[0]) {
            return rs[0];
        } else {
            return null;
        }
    }
}


async function dataSticker(hn, vaccine_name_data) {

    // console.log('hn=' + hn)
    let ck_risk = await model.getInfectedCOVID(dbHIS, hn);
    // console.log(ck_risk[0][0])
    let sortName = [];
    vaccine_name_data.forEach(async(v, i) => {
        await sortName.push(`${i+1}.${shortNameVaccine(v.vaccine_manufacturer_name)} ${moment(v.vaccine_date).add(543, 'years').format("DD/MM/YYYY")}`)
    })
    const payload = {
        vocid_detect: ck_risk[0][0] || null,
        vacc_sort_name: sortName
    }
    return await payload
        // console.log(payload)
}

function shortNameVaccine(vaccine_name) {
    let rawdata = JSON.parse(fs.readFileSync('config_map_vaccine.json'));
    var key = Object.entries(rawdata).find(i => i[0] === vaccine_name)[1];
    if (key) {
        return key
    } else {
        log_vaccine_name(vaccine_name)
        return vaccine_name;
    }
}

function log_vaccine_name(vaccine_name) {
    let payload = vaccine_name;
    fs.appendFileSync("./no_log_vaccine_name.log", `${payload},`);
}



async function runJob() {
    // await checkToken();
    log("[runJob]", false);
    await getToken();
    setTimeout(() => {
        // getFixBug();
        // updateFixBug();
        getVaccineBooking(process.env.TABLE_MULTIPLE);
        // getList()
            // getVaccineBookingTravel()
            // checkImmunizationHistoryCID('1200900099000') //TEST DEBUG
    }, 100);
}
// runJob();


// console.log(shortNameVaccine("Johnson & Johnson"));

// const token1y = jwt.sign({ username: 'server_gen', name: 'server_gen' },
//     process.env.JWT_KEY, {
//         expiresIn: "1y",
//     }
// );
// console.log(token1y);
//error handlers
if (process.env.NODE_ENV === "development") {
    // @ts-ignore
    app.use((err, req, res, next) => {
        console.log(err.stack);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: {
                ok: false,
                code: HttpStatus.INTERNAL_SERVER_ERROR,
                error: HttpStatus.getStatusText(HttpStatus.INTERNAL_SERVER_ERROR)
            }
        });
    });
}

// @ts-ignore
app.use((req, res, next) => {
    res.status(HttpStatus.NOT_FOUND).json({
        error: {
            ok: false,
            code: HttpStatus.NOT_FOUND,
            error: HttpStatus.getStatusText(HttpStatus.NOT_FOUND)
        }
    });
});

var port = +process.env.WWW_PORT || 3000;

app.listen(port, () => console.log(`Api listening on port ${port}!`));