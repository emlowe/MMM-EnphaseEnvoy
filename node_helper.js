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

module.exports = NodeHelper.create({

    start: function() {
        Log.log(`Starting node helper for: ${this.name}`);
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
