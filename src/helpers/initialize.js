/**
 * Pterodactyl Daemon
 * Copyright (c) 2015 Dane Everitt <dane@daneeveritt.com>
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
const rfr = require('rfr');
const Async = require('async');
const Path = require('path');
const Util = require('util');
const Fs = require('fs-extra');
const Log = rfr('lib/helpers/logger.js');

const Server = rfr('lib/controllers/server.js');
const Servers = {};

class Initialize {
    constructor() {
        //
    }

    /**
     * Initializes all servers on the system and loads them into memory for NodeJS.
     * @param  {Function} next [description]
     * @return {[type]}        [description]
     */
    init(next) {
        const self = this;
        this._folders = [];
        Fs.walk('./config/servers/').on('data', function (data) {
            self._folders.push(data.path);
        }).on('end', function () {
            Async.each(self._folders, function (file, callback) {
                if (Path.extname(file) === '.json') {
                    Fs.readJson(file, function (errJson, json) {
                        if (errJson) {
                            Log.warn(errJson, Util.format('Unable to parse JSON in %s due to an error, skipping...', file));
                            return;
                        }

                        // Is this JSON valid enough?
                        if (typeof json.uuid === 'undefined') {
                            Log.warn(Util.format('Detected valid JSON, but server was missing a UUID in %s, skipping...', file));
                            return;
                        }

                        // Initalize the Server
                        self.setup(json, callback);
                    });
                } else {
                    return callback();
                }
            }, function (errAsync) {
                return next(errAsync);
            });
        });
    }

    /**
     * Performs the setup action for a specific server.
     * @param  {[type]}   json [description]
     * @param  {Function} next [description]
     * @return {[type]}        [description]
     */
    setup(json, next) {
        Servers[json.uuid] = new Server(json, function setupCallback(err) {
            Log.info(Util.format('Loaded server configuration and initalized server for UUID:%s', json.uuid));
            return next(err);
        });
    }
}

exports.Initialize = Initialize;
exports.Servers = Servers;