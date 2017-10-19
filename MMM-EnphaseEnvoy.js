/* Module */

/* Magic Mirror
 * Module: MMM-EnphaseEnvoy
 *
 * By Earle Lowe elowe@elowe.com
 * Apache Licensed.
 */
Module.register("MMM-EnphaseEnvoy",{

	defaults: {
		hostname: "",
		initialLoadDelay: 0,
		updateInterval:  30 * 60 * 1000, // every 30 minutes
	},

	// Define start sequence.
	start: function() {
		this.loaded = false;
		this.enphaseData = null;

		this.sendSocketNotification("CONFIG", this.config);

		this.scheduleUpdate(this.config.initialLoadDelay);
	},

    getStyles: function() {
        return ['font-awesome.css', "MMM-EnphaseEnvoy.css"];
    },

	getData: function() {
		this.sendSocketNotification("GET_DATA");
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "DATA") {
			this.enphaseData = JSON.parse(payload);

			this.loaded = true;
			this.updateDom();
		}
		this.scheduleUpdate()
	},

	// Override dom generator.
	getDom: function() {

		var wrapper = document.createElement("div");

		if (!this.loaded) {
			wrapper.innerHTML = "Getting Data";
			wrapper.className = "dimmed light small";

			return wrapper;
		}

		if (this.enphaseData) 
		{
			weekUnit = this.enphaseData[4];
			lifeUnit = this.enphaseData[6];
			currentString = this.enphaseData[1] + " Watts";
			todayString = this.enphaseData[2] + " " + weekUnit + "Wh";
			weekString = this.enphaseData[3] + " " + weekUnit + "Wh";
			lifeString = this.enphaseData[5] + " " + lifeUnit + "Wh";

			var table = document.createElement("TABLE");
			table.className = "table";

			var imgDiv = document.createElement("div");
            		var img = document.createElement("img");
            		img.src = "/modules/MMM-EnphaseEnvoy/solar_white.png";

		        var sTitle = document.createElement("p");
		        sTitle.innerHTML = "Solar PV";
		        sTitle.className += " header thin normal";
		        imgDiv.appendChild(img);
		    	imgDiv.appendChild(sTitle);

		        var divider = document.createElement("hr");
		        divider.className += " dimmed";
		        wrapper.appendChild(imgDiv);
		        wrapper.appendChild(divider);
			
			var currenttr = document.createElement("tr");
			table.appendChild(currenttr);
			var currentl = document.createElement("td");
			var currentr = document.createElement("td");
			currentl.className += " title medium light bright";
			currentr.className += " data medium light normal";
			currentl.innerHTML = "Current Power:";
			currentr.innerHTML = currentString;
			currenttr.appendChild(currentl);
			currenttr.appendChild(currentr);

			var todaytr = document.createElement("tr");
			table.appendChild(todaytr);
			var todayl = document.createElement("td");
			var todayr = document.createElement("td");
			todayl.className += " title medium light bright";
			todayr.className += " data medium light normal";
			todayl.innerHTML = "Today:";
			todayr.innerHTML = todayString;
			todaytr.appendChild(todayl);
			todaytr.appendChild(todayr);

			var weektr = document.createElement("tr");
			table.appendChild(weektr);
			var weekl = document.createElement("td");
			var weekr = document.createElement("td");
			weekl.className += " title medium light bright";
			weekr.className += " data medium light normal";
			weekl.innerHTML = "This Week:";
			weekr.innerHTML = weekString;
			weektr.appendChild(weekl);
			weektr.appendChild(weekr);

			var lifetr = document.createElement("tr");
			table.appendChild(lifetr);
			var lifel = document.createElement("td");
			var lifer = document.createElement("td");
			lifel.className += " title medium light bright";
			lifer.className += " data medium light normal";
			lifel.innerHTML = "Lifetime:";
			lifer.innerHTML = lifeString;
			lifetr.appendChild(lifel);
			lifetr.appendChild(lifer);

			wrapper.appendChild(table);
		}

		return wrapper;
	},

	notificationReceived: function(notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {	
			this.updateDom();
		}
	},

	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		setTimeout(function() { self.getData(); }, nextLoad);
	},

});
