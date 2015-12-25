/**
 * Pterodactyl Daemon
 * Copyright (c) 2015 Dane Everitt <dane@daneeveritt.com>
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
const rfr = require('rfr');
const Log = rfr('lib/helpers/logger.js');
const Async = require('async');
const Docker = rfr('lib/controllers/docker.js');
const Plugin = rfr('lib/services/minecraft/index.js');
const moment = require('moment');
const Status = rfr('lib/helpers/status.js');

class Server {

    constructor(json, next) {
        // Setup Initial Values
        const self = this;
        this.status = Status.OFF;
        this._json = json;
        this.uuid = this._json.uuid;

        this.log = Log.child({ server: this.uuid });
        this.lastCrash = undefined;

        this.docker = new Docker(this, function constructorServer(err, status) {
            if (status === true) {
                self.log.info('Daemon detected that the server container is currently running, re-attaching to it now!');
            }
            return next(err);
        });

        this.plugin = new Plugin(this);
    }

    hasPermission(perm, token) {
        if (typeof perm !== 'undefined' && typeof token !== 'undefined') {
            if (typeof this._json.keys !== 'undefined' && token in this._json.keys) {
                if (this._json.keys[token].indexOf(perm) > -1) {
                    return true;
                }
            }
        }
        return false;
    }

    preflight(next) {
        // Return immediately if server is currently powered on.
        if (this.status !== Status.OFF) {
            return next(new Error('Server is already running.'));
        }
        // @TODO: plugin specific preflights
        return next();
    }

    start(next) {
        const self = this;
        if (this.status !== Status.OFF) {
            return next(new Error('Server is already running.'));
        }

        Async.series([
            function (callback) {
                self.log.debug('Initializing for boot sequence, running preflight checks.');
                self.preflight(callback);
            },
            function (callback) {
                self.docker.start(callback);
            },
            function (callback) {
                self.docker.attach(callback);
            },
        ], function (err, reboot) {
            if (err) {
                self.log.error(err);
                return next(err);
            }

            if (typeof reboot !== 'undefined') {
                // @TODO: Handle the need for a reboot here.
            }
            return next();
        });
    }

    stop(next) {
        const self = this;
        if (this.status === Status.OFF) {
            return next(new Error('Server is already stopped.'));
        }

        this.status = Status.STOPPING;
        this.docker.stop(function (err) {
            self.status = Status.OFF;
            return next(err);
        });
    }

    kill(next) {
        const self = this;
        if (this.status === Status.OFF) {
            return next(new Error('Server is already stopped.'));
        }

        self.status = Status.STOPPING;
        this.docker.kill(function (err) {
            self.status = Status.OFF;
            return next(err);
        });
    }

    restart(next) {
        const self = this;
        Async.series([
            function (callback) {
                if (self.status !== Status.OFF) {
                    self.stop(callback);
                } else {
                    // Already off, lets move on.
                    return callback();
                }
            },
            function (callback) {
                self.start(callback);
            },
        ], function (err) {
            return next(err);
        });
    }

    /**
     * Send output from server container to websocket.
     */
    output(output) {
        if (output.replace(/[\x00-\x1F\x7F-\x9F]/g, '') === null || output.replace(/[\x00-\x1F\x7F-\x9F]/g, '') === '' || output.replace(/[\x00-\x1F\x7F-\x9F]/g, '') === ' ') {
            return;
        }
        // For now, log to console, and strip control characters from output.
        this.plugin.onConsole(output);
        // console.log(output.replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
    }

    /**
     * Determines if the container stream should have ended yet, if not, mark server crashed.
     */
    streamClosed() {
        const self = this;
        if (this.status === Status.OFF || this.status === Status.STOPPING) {
            return;
        }

        this.status = Status.OFF;
        if (moment.isMoment(this.lastCrash)) {
            if (moment(this.lastCrash).add(60, 'seconds').isAfter(moment())) {
                this.setCrashTime();
                this.log.debug('Server detected as crashed but has crashed within the last 60 seconds.');
                return;
            }
        }

        this.log.debug('Server detected as crashed... attempting reboot.');
        this.setCrashTime();

        this.start(function (err) {
            if (err) self.log.fatal(err);
            self.log.debug('Server started after crash...');
        });
    }

    setCrashTime() {
        this.lastCrash = moment();
    }

}

module.exports = Server;