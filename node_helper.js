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

        http.get(url, (res) => {
          let data = ''; 
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            var self=this;
            var re = new RegExp('<td>Currently</td>.*<td>(.*?) (.?)W</td></tr>.*<td>Today</td>.*<td>(.*?) (.?)Wh</td></tr>.*<td>Past Week</td>.*<td>(.*?) (.?)Wh</td></tr>.*<td>Since Installation</td>.*<td>(.*?) (.?)Wh</td></tr>');

            m = re.exec(data);
            var myjson = JSON.stringify(m);
            self.sendSocketNotification("DATA", myjson) ;
          });
        }).on('error', (err) => {
          Log.error(`Got error: ${err.message}`);
        });
        },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CONFIG") {
            this.config = payload;
        } else if (notification === "GET_DATA") {
            this.getEnphaseData();
        }
    }

});

