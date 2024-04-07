const process = require("process");
const fs = require("fs");

const express = require("express");
const ejs = require("ejs");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const {db} = require("./db.js");

(async () => {
    const app = express();
    app.use(morgan("combined"));
    app.use(bodyParser.urlencoded({limit: "50mb", extended: false, parameterLimit: 1000000}));
    app.set("trust proxy", 1);

    app.get("/", (req, res) => res.redirect("index"));

    const helpers = require("./helpers.js");

    for (let page of fs.readdirSync("views")) {
        if (!page.endsWith(".ejs")) continue;
        app.get("/" + page.slice(0, -4), (req, res, next) => {
            ejs.renderFile("./views/" + page, {req, res, env: process.env, db, ...helpers}, {async: true}, (err, strPromise) => {
                if (err) return next(err);
                strPromise.then(str => {
                    res.send(str);
                    next();
                }).catch((err) => next(err));
            });
        });
    }

    for (let page of fs.readdirSync("actions")) {
        console.log(page);
        if (!page.endsWith(".js")) continue;
        app.post("/" + page.slice(0, -3), (req, res, next) => {
            (async () => {
                await require("./actions/" + page)(req, res);
            })().then(() => next()).catch((err) => next(err));
        });
    }

    await new Promise(resolve => app.listen(3000, () => resolve()));
    console.log("Listening on port 3000");
})().catch(console.error);
