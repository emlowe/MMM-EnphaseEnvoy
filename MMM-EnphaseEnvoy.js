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
		updateInterval: 5 * 60 * 1000, // every 5 minutes
		staleAfter: 3, // missed updates before the panel says data is old
	},

	// Define start sequence.
	start: function() {
		this.loaded = false;
		this.enphaseData = null;
		this.lastUpdate = 0;
		this.weatherType = "day-sunny"; // until the weather module reports in

		this.sendSocketNotification("CONFIG", this.config);

		this.scheduleUpdate(this.config.initialLoadDelay);
	},

	getStyles: function() {
		return ["weather-icons.css", "MMM-EnphaseEnvoy.css"];
	},

	getData: function() {
		this.sendSocketNotification("GET_DATA", this.config);
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "DATA") {
			try {
				var parsed = JSON.parse(payload);
				if (parsed) {
					this.enphaseData = parsed;
					this.lastUpdate = Date.now();
					this.loaded = true;
				}
			} catch (e) {
				Log.error("MMM-EnphaseEnvoy: could not parse data: " + e.message);
			}
			this.updateDom();
		} else if (notification === "DATA_ERROR") {
			this.updateDom();
		}
		this.scheduleUpdate();
	},

	// Create an element with a class and optional text.
	el: function(tag, className, text) {
		var node = document.createElement(tag);
		if (className) {
			node.className = className;
		}
		if (text !== undefined) {
			node.textContent = text;
		}
		return node;
	},

	// One of the three totals under the power reading.
	total: function(label, value, unit) {
		var node = this.el("div");
		node.appendChild(this.el("div", "solar-label", label));
		var valueNode = this.el("div", "solar-value", value + " ");
		valueNode.appendChild(this.el("span", "solar-label", unit));
		node.appendChild(valueNode);
		return node;
	},

	isStale: function() {
		return Date.now() - this.lastUpdate > this.config.updateInterval * this.config.staleAfter;
	},

	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		if (!this.loaded || !this.enphaseData) {
			wrapper.textContent = "Getting Data";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		var data = this.enphaseData;
		var stale = this.isStale();
		wrapper.className = "solar-panel" + (stale ? " solar-stale" : "");

		var head = this.el("div", "solar-head");
		head.appendChild(this.el("span", null, stale ? "Solar: no recent data" : "Solar"));
		head.appendChild(this.el("i", "solar-icon wi wi-" + this.weatherType));
		wrapper.appendChild(head);

		var power = this.el("div", "solar-power", data[1]);
		power.appendChild(this.el("span", "solar-power-unit", " " + data[2] + "W"));
		wrapper.appendChild(power);

		var totals = this.el("div", "solar-totals");
		totals.appendChild(this.total("Today", data[3], data[4] + "Wh"));
		totals.appendChild(this.total("Week", data[5], data[6] + "Wh"));
		totals.appendChild(this.total("Lifetime", data[7], data[8] + "Wh"));
		wrapper.appendChild(totals);

		return wrapper;
	},

	notificationReceived: function(notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.updateDom();
		} else if (notification === "WEATHER_UPDATED" && payload && payload.currentWeather && payload.currentWeather.weatherType) {
			// Forecast-only weather modules send no current weather, so they're ignored.
			if (payload.currentWeather.weatherType !== this.weatherType) {
				this.weatherType = payload.currentWeather.weatherType;
				this.updateDom();
			}
		}
	},

	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		clearTimeout(this.updateTimer);
		this.updateTimer = setTimeout(function() { self.getData(); }, nextLoad);
	},

});
