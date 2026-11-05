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
		this.samples = []; // today's [time, watts] readings from the node helper
		this.sunrise = null;
		this.sunset = null;

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
		if (notification === "HISTORY") {
			this.samples = payload || [];
			return; // DATA follows straight away and redraws the panel
		}
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

	// A smooth path through the points that never overshoots them, so the curve
	// can't dip below zero or rise above the day's peak (monotone cubic).
	smoothPath: function(points) {
		var count = points.length;
		var path = "M" + points[0][0].toFixed(1) + " " + points[0][1].toFixed(1);
		if (count < 2) {
			return path;
		}

		var widths = [];
		var slopes = [];
		for (var i = 0; i < count - 1; i++) {
			widths[i] = points[i + 1][0] - points[i][0];
			slopes[i] = (points[i + 1][1] - points[i][1]) / widths[i];
		}

		var tangents = [slopes[0]];
		for (var j = 1; j < count - 1; j++) {
			if (slopes[j - 1] * slopes[j] <= 0) {
				tangents[j] = 0; // a peak or a dip stays flat at the reading
			} else {
				var mean = (slopes[j - 1] * widths[j] + slopes[j] * widths[j - 1]) / (widths[j - 1] + widths[j]);
				var limit = 2 * Math.min(Math.abs(slopes[j - 1]), Math.abs(slopes[j]), Math.abs(mean) / 2);
				tangents[j] = Math.sign(slopes[j]) * limit;
			}
		}
		tangents[count - 1] = slopes[count - 2];

		for (var k = 0; k < count - 1; k++) {
			var third = widths[k] / 3;
			path += " C" + [
				points[k][0] + third,
				points[k][1] + third * tangents[k],
				points[k + 1][0] - third,
				points[k + 1][1] - third * tangents[k + 1],
				points[k + 1][0],
				points[k + 1][1]
			].map(function(n) { return n.toFixed(1); }).join(" ");
		}
		return path;
	},

	// The Envoy publishes a new value about every 15 minutes, so repeated readings
	// of it would draw stairs. Keep the first reading of each value, the end of any
	// long flat stretch, and the latest reading.
	settledSamples: function(samples) {
		var LONG_FLAT = 30 * 60 * 1000;
		return samples.filter(function(sample, index) {
			var previous = samples[index - 1];
			var next = samples[index + 1];
			if (!previous || !next || sample[1] !== previous[1]) {
				return true;
			}
			if (next[1] === sample[1]) {
				return false;
			}
			var first = index;
			while (first > 0 && samples[first - 1][1] === sample[1]) {
				first--;
			}
			return sample[0] - samples[first][0] >= LONG_FLAT;
		});
	},

	// A light weighted average to take out small wiggles. The ends stay put, so
	// the line still starts at its first reading and reaches the current one.
	softenPoints: function(points) {
		return points.map(function(point, index) {
			if (index === 0 || index === points.length - 1) {
				return point;
			}
			return [point[0], (points[index - 1][1] + 2 * point[1] + points[index + 1][1]) / 4];
		});
	},

	svg: function(tag, className, attributes) {
		var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		node.setAttribute("class", className);
		Object.keys(attributes).forEach(function(name) {
			node.setAttribute(name, attributes[name]);
		});
		return node;
	},

	formatTime: function(time) {
		var date = new Date(time);
		var minutes = String(date.getMinutes()).padStart(2, "0");
		if (config.timeFormat === 24) {
			return date.getHours() + ":" + minutes;
		}
		return (date.getHours() % 12 || 12) + ":" + minutes;
	},

	formatPower: function(watts) {
		return watts >= 1000 ? (watts / 1000).toFixed(1) + " kW" : Math.round(watts) + " W";
	},

	// The part of the day to plot: sunrise to sunset, widened if the panels
	// produced outside it. Without today's sun times, falls back to the readings.
	graphWindow: function(samples) {
		var isToday = function(time) {
			return time && new Date(time).toDateString() === new Date().toDateString();
		};
		var producing = samples.filter(function(sample) { return sample[1] > 0; });
		var start = isToday(this.sunrise) ? this.sunrise : new Date().setHours(6, 0, 0, 0);
		var end = isToday(this.sunset) ? this.sunset : new Date().setHours(18, 0, 0, 0);
		if (producing.length) {
			start = Math.min(start, producing[0][0]);
			end = Math.max(end, producing[producing.length - 1][0]);
		}
		return { start: start, end: end };
	},

	// Power so far today, drawn beside the current reading.
	buildGraph: function(stale) {
		var WIDTH = 200, HEIGHT = 70, TOP = 6, BASELINE = 66;

		var today = new Date().toDateString();
		var todays = this.samples.filter(function(sample) {
			return new Date(sample[0]).toDateString() === today;
		});
		var range = this.graphWindow(todays);
		var samples = todays.filter(function(sample) {
			return sample[0] >= range.start && sample[0] <= range.end;
		});
		var peak = samples.reduce(function(highest, sample) { return Math.max(highest, sample[1]); }, 0);

		var toPoint = function(sample) {
			return [
				(sample[0] - range.start) / (range.end - range.start) * WIDTH,
				BASELINE - (peak > 0 ? sample[1] / peak : 0) * (BASELINE - TOP)
			];
		};

		var graph = this.el("div", "solar-graph");
		var chart = this.svg("svg", "solar-chart", { viewBox: "0 0 " + WIDTH + " " + HEIGHT });
		chart.appendChild(this.svg("line", "solar-baseline", { x1: 0, y1: BASELINE, x2: WIDTH, y2: BASELINE }));

		// Time the Pi was off is left as a gap instead of a line across it.
		var maxGap = this.config.updateInterval * this.config.staleAfter;
		var runs = [];
		samples.forEach(function(sample, index) {
			if (index === 0 || sample[0] - samples[index - 1][0] > maxGap) {
				runs.push([]);
			}
			runs[runs.length - 1].push(sample);
		});

		var self = this;
		runs.filter(function(run) { return run.length > 1; }).forEach(function(run) {
			var points = self.softenPoints(self.settledSamples(run).map(toPoint));
			var line = self.smoothPath(points);
			var area = line + " L" + points[points.length - 1][0].toFixed(1) + " " + BASELINE + " L" + points[0][0].toFixed(1) + " " + BASELINE + " Z";
			chart.appendChild(self.svg("path", "solar-area", { d: area }));
			chart.appendChild(self.svg("path", "solar-line", { d: line }));
		});

		if (samples.length && !stale && Date.now() <= range.end) {
			var latest = toPoint(samples[samples.length - 1]);
			chart.appendChild(this.svg("circle", "solar-now", { cx: latest[0], cy: latest[1], r: 4 }));
		}
		graph.appendChild(chart);

		var labels = this.el("div", "solar-graph-labels");
		labels.appendChild(this.el("span", null, this.formatTime(range.start)));
		labels.appendChild(this.el("span", null, peak > 0 ? "Peak " + this.formatPower(peak) : ""));
		labels.appendChild(this.el("span", null, this.formatTime(range.end)));
		graph.appendChild(labels);

		return graph;
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

		var middle = this.el("div", "solar-middle");
		middle.appendChild(power);
		middle.appendChild(this.buildGraph(stale));
		wrapper.appendChild(middle);

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
			this.sunrise = payload.currentWeather.sunrise || this.sunrise;
			this.sunset = payload.currentWeather.sunset || this.sunset;
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
