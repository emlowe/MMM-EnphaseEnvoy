/* Magic Mirror
 * 
 * Node Helper for MMM-AutelisPentair module
 *
 * Earle Lowe elowe@elowe.com
 * Apache License
 */
const NodeHelper = require('node_helper');
const request = require('request');

module.exports = NodeHelper.create({
        
    start: function() {
        console.log("Starting module: " + this.name);
    },

    getEnphaseData: function() {
        var url = "http://" + this.config.hostname + "/production";
        request.get({
            url: url,
            headers: {
                'User-Agent': 'MagicMirror/1.0'
            }
        }, (error, response, body) => {
            if (!error && response.statusCode == 200) {
		     	    var self=this;

			    var re = new RegExp('<td>Currently</td>.*<td>(.*?) W</td></tr>.*<td>Today</td>.*<td>(.*?) .?Wh</td></tr>.*<td>Past Week</td>.*<td>(.*?) (.)Wh</td></tr>.*<td>Since Installation</td>.*<td>(.*?) (.)Wh</td></tr>');

   			    m = re.exec(body);

			    var myjson = JSON.stringify(m);
			    
			    console.log(myjson);

			    self.sendSocketNotification("DATA", myjson) ;
			}
        });
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CONFIG") {
	    console.log("Got Config");
            this.config = payload;
        } else if (notification === "GET_DATA") {
	    console.log("Got GET_DATA");
            this.getEnphaseData();
        }
    }

});
