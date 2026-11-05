/* Magic Mirror
 *
 * Node Helper for MMM-EnphaseEnvoy module
 *
 * Earle Lowe elowe@elowe.com
 * Apache License
 */
const NodeHelper = require('node_helper');
const Log = require("logger");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "history.json");
const MIN_SAMPLE_GAP = 60 * 1000; // several open pages shouldn't add extra samples
const UNIT_FACTORS = { "": 1, k: 1e3, M: 1e6 };

module.exports = NodeHelper.create({

    start: function() {
        Log.log(`Starting node helper for: ${this.name}`);
        this.history = this.loadHistory();
    },

    // Local calendar day, so history resets at the mirror's midnight.
    dayKey: function(time) {
        return new Date(time).toDateString();
    },

    loadHistory: function() {
        var today = this.dayKey(Date.now());
        try {
            var saved = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
            if (saved.day === today && Array.isArray(saved.samples)) {
                return saved;
            }
        } catch (e) {
            if (e.code !== "ENOENT") {
                Log.error(`MMM-EnphaseEnvoy: ignoring saved history: ${e.message}`);
            }
        }
        return { day: today, samples: [] };
    },

    // Write then rename, so a power cut can't leave half a file behind.
    saveHistory: function() {
        var tempFile = `${HISTORY_FILE}.tmp`;
        try {
            fs.writeFileSync(tempFile, JSON.stringify(this.history));
            fs.renameSync(tempFile, HISTORY_FILE);
        } catch (e) {
            Log.error(`MMM-EnphaseEnvoy: could not save history: ${e.message}`);
        }
    },

    // Add one [time, watts] reading to today's history.
    recordSample: function(value, unit) {
        var watts = parseFloat(value.replace(/,/g, "")) * UNIT_FACTORS[unit];
        if (!Number.isFinite(watts)) {
            Log.error(`MMM-EnphaseEnvoy: could not read power value "${value} ${unit}W"`);
            return;
        }

        var now = Date.now();
        var today = this.dayKey(now);
        if (this.history.day !== today) {
            this.history = { day: today, samples: [] };
        }

        var last = this.history.samples[this.history.samples.length - 1];
        if (!last || now - last[0] >= MIN_SAMPLE_GAP) {
            this.history.samples.push([now, watts]);
            this.saveHistory();
        }
    },

    getEnphaseData: function() {
        var url = "http://" + this.config.hostname + "/production";

        var fail = (message) => {
            Log.error(`MMM-EnphaseEnvoy: ${message}`);
            this.sendSocketNotification("DATA_ERROR", message);
        };

        var req = http.get(url, { timeout: 15000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                var re = new RegExp('<td>Currently</td>.*<td>(.*?) (.?)W</td></tr>.*<td>Today</td>.*<td>(.*?) (.?)Wh</td></tr>.*<td>Past Week</td>.*<td>(.*?) (.?)Wh</td></tr>.*<td>Since Installation</td>.*<td>(.*?) (.?)Wh</td></tr>');

                var m = re.exec(data);
                if (!m) {
                    fail("could not find production values in the Envoy page");
                    return;
                }
                this.recordSample(m[1], m[2]);
                this.sendSocketNotification("HISTORY", this.history.samples);
                this.sendSocketNotification("DATA", JSON.stringify(m));
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error("request timed out"));
        });
        req.on('error', (err) => {
            fail(`Got error: ${err.message}`);
        });
    },

    socketNotificationReceived: function(notification, payload) {
        // Config is sent with CONFIG and with every GET_DATA, so the helper
        // never depends on CONFIG having arrived first.
        if (payload && payload.hostname) {
            this.config = payload;
        }
        if (notification === "GET_DATA") {
            if (!this.config || !this.config.hostname) {
                Log.error("MMM-EnphaseEnvoy: no hostname configured yet");
                this.sendSocketNotification("DATA_ERROR", "no hostname configured yet");
                return;
            }
            this.getEnphaseData();
        }
    }

});
