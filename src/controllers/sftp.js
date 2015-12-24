/**
 * Pterodactyl Daemon
 * Copyright (c) 2015 Dane Everitt <dane@daneeveritt.com>
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
const rfr = require('rfr');

const LoadConfig = rfr('lib/helpers/config.js');
const Dockerode = require('dockerode');

const Config = new LoadConfig();
const DockerController = new Dockerode({
    socketPath: Config.get('docker.socket', '/var/run/docker.sock'),
});

// docker run -d --name sftp -v /srv/data:/sftp-root -v /srv/daemon/config/credentials:/creds -p 2022:22 quay.io/pterodactyl/scrappy
class SFTP {
    constructor() {
        this._container = DockerController.getContainer(Config.get('sftp.container'));
    }

    /**
     * Starts the SFTP container on the system.
     * @param  {Function} next [description]
     * @return {[type]}        [description]
     */
    startService(next) {
        this._container.start(function sftpContainerStart(err) {
            // Container is already running, we can just continue on and pretend we started it just now.
            if (err && err.message.indexOf('HTTP code is 304 which indicates error: container already started') > -1) {
                return next();
            }
            return next(err);
        });
    }

    /**
     * Creates a new SFTP user on the system.
     * @param  string     username
     * @param  password   password
     * @param  {Function} next
     * @return {Callback}
     */
    create(username, password, next) {
        return this._doExec(['scrappyuser', '-u', username, '-p', password], next);
    }

    /**
     * Updates the password for a SFTP user on the system.
     * @param  string     username
     * @param  password   password
     * @param  {Function} next
     * @return {Callback}
     */
    password(username, password, next) {
        return this._doExec(['scrappypwd', '-u', username, '-p', password], next);
    }

    /**
     * Handles passing execution to the container for create and password.
     * @param  array     command
     * @param  {Function} next
     * @return {Callback}
     */
    _doExec(command, next) {
        this._container.exec({
            Cmd: command,
            AttachStdin: true,
            AttachStdout: true,
            Tty: true,
        }, function sftpExec(err, exec) {
            if (err) return next(err);
            exec.start(function sftpExecStreamStart(execErr, stream) {
                if (!execErr && stream) {
                    stream.setEncoding('utf8');
                    stream.on('end', function sftpExecStreamEnd() {
                        exec.inspect(function sftpExecInspect(inspectErr, data) {
                            if (inspectErr) return next(inspectErr);
                            if (data.ExitCode !== 0) {
                                return next(new Error('Docker returned a non-zero exit code when attempting to execute a SFTP command.'));
                            }
                            return next();
                        });
                    });
                }
                return next(execErr);
            });
        });
    }
}

module.exports = SFTP;
