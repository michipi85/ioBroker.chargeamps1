'use strict';

// API-Version: https://eapi.charge.space/swagger/index.html v5

const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;

class Chargeamps extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options = {}) {
        super({
            ...options,
            name: 'chargeamps',
        });
        this.token = '';
        this.chargepoints = [];
        this.statuscode = 0;
        this.refreshIntervalObject = null;
        this.logged_in = false;
        this.lastSyncDate = '2000-01-01T00:00:00.000Z';
        this.refreshInterval = 30;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            this.log.info(`Adapter ${this.name} is starting...`);
            this.refreshInterval = Math.max(this.config.Interval, 15);
            this.log.info(`Refresh Interval: ${this.refreshInterval} seconds`);

            await this.setObjectNotExistsAsync('chargeamps.0', {
                type: 'device',
                common: {
                    name: 'Charge Amps',
                },
                native: {},
            });

            const loginSuccess = await this.chargeampsLogin(this.config.email, this.config.password, this.config.apikey);
            if (loginSuccess) {
                this.log.info('Logged in successfully');

                // Lade die Einstellungen für jeden Chargepoint und Connector
                for (const chargePointId of this.chargepoints) {
                    await this.chargeampsGetSettings(chargePointId);
                    const connectors = [1, 2]; // Beispiel: Connector-IDs (anpassen, falls dynamisch)
                    for (const connectorId of connectors) {
                        await this.chargeampsGetConnectorSettings(chargePointId, connectorId);
                    }
                }

                this.refreshIntervalObject = setInterval(() => this.refreshChargepoints(), this.refreshInterval * 1000);
            } else {
                this.log.error('Login failed. Adapter will not function properly.');
            }
        } catch (error) {
            this.log.error(`Error in onReady: ${error.message}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.refreshIntervalObject) {
                clearInterval(this.refreshIntervalObject);
            }
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state && !state.ack) {
            try {
                this.log.info(`State change detected: ${id}, value: ${state.val}`);

                const parts = id.split('.');
                if (parts.length < 5) {
                    this.log.warn(`Invalid state ID format: ${id}`);
                    return;
                }

                const chargePointId = parts[2];
                const command = parts.pop();
                const connectorId = parts[4] || null;

                if (command === 'Reboot') {
                    await this.chargeampsReboot(chargePointId);
                } else if (command.startsWith('RemoteStart_')) {
                    if (connectorId) {
                        await this.chargeampsRemoteStart(chargePointId, connectorId);
                    } else {
                        this.log.warn(`Connector ID is missing for RemoteStart command.`);
                    }
                } else if (command.startsWith('RemoteStop_')) {
                    if (connectorId) {
                        await this.chargeampsRemoteStop(chargePointId, connectorId);
                    } else {
                        this.log.warn(`Connector ID is missing for RemoteStop command.`);
                    }
                } else if (id.includes('.settings.')) {
                    const settingKey = parts.slice(6).join('.');
                    if (settingKey) {
                        this.log.info(`Updating setting ${settingKey} for chargepoint ${chargePointId}, connector ${connectorId}`);
                        const settings = { [settingKey]: state.val };

                        await this.chargeampsUpdateConnectorSettings(chargePointId, connectorId, settings);
                        this.log.info(`Setting ${settingKey} updated successfully.`);
                        await this.setStateAsync(id, { val: state.val, ack: true });
                    } else {
                        this.log.warn(`Setting key could not be determined for ID: ${id}`);
                    }
                } else {
                    this.log.warn(`Unknown command or state change detected: ${id}`);
                }
            } catch (error) {
                this.log.error(`Error processing state change for ${id}: ${error.message}`);
            }
        } else if (!state) {
            this.log.info(`State ${id} deleted`);
        }
    }

    /**
     * Helper method to make API requests
     * @param {string} url
     * @param {string} method
     * @param {object} [data]
     * @returns {Promise<any>}
     */
    async apiRequest(url, method, data = null) {
        try {
            const options = {
                method,
                url,
                headers: {
                    'Content-Type': 'application/json',
                    apiKey: this.config.apikey,
                    Authorization: `Bearer ${this.token}`,
                },
                data,
            };
            this.log.debug(`API Request: ${JSON.stringify(options)}`);
            const response = await axios(options);
            this.log.debug(`API Response: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.log.error(`API Request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Login to Charge Amps cloud service
     * @param {string} email
     * @param {string} password
     * @param {string} apiKey
     * @returns {Promise<boolean>}
     */
    async chargeampsLogin(email, password, apiKey) {
        try {
            this.log.debug('Logging in to Charge Amps');
            const data = { email, password };
            const response = await this.apiRequest('https://eapi.charge.space/api/v5/auth/login', 'POST', data);
            this.token = response.token;
            this.logged_in = true;
            await this.chargeampsGetOwnedChargepoints();
            return true;
        } catch (error) {
            this.log.error('Login failed');
            this.logged_in = false;
            return false;
        }
    }

    /**
     * Refresh chargepoints status
     */
    async refreshChargepoints() {
        if (!this.logged_in) {
            this.log.warn('Not logged in. Skipping refresh.');
            return;
        }
        try {
            this.log.debug('Refreshing chargepoints');
            for (const chargepointId of this.chargepoints) {
                await this.chargeampsGetChargepointStatus(chargepointId);
                await this.chargeampsGetSettings(chargepointId); // Einstellungen aktualisieren
            }
        } catch (error) {
            this.log.error(`Error refreshing chargepoints: ${error.message}`);
        }
    }

    /**
     * Get owned chargepoints
     */
    async chargeampsGetOwnedChargepoints() {
        try {
            this.log.debug('Fetching owned chargepoints');
            const response = await this.apiRequest('https://eapi.charge.space/api/v5/chargepoints/owned', 'GET');
            this.chargepoints = response.map((cp) => cp.id);
            for (const chargepoint of response) {
                await this.SaveValues(chargepoint.name, chargepoint);
            }
        } catch (error) {
            this.log.error(`Error fetching chargepoints: ${error.message}`);
        }
    }

    /**
     * Get chargepoint status
     * @param {string} id
     */
    async chargeampsGetChargepointStatus(id) {
        try {
            this.log.debug(`Fetching status for chargepoint ${id}`);
            const response = await this.apiRequest(`https://eapi.charge.space/api/v5/chargepoints/${id}/status`, 'GET');
            await this.SaveValues(`${id}.status`, response);
        } catch (error) {
            this.log.error(`Error fetching status for chargepoint ${id}: ${error.message}`);
        }
    }

    /**
    * Get settings for a specific chargepoint
    * @param {string} chargePointId
     */
    async chargeampsGetSettings(chargePointId) {
        try {
            this.log.info(`Fetching settings for chargepoint ${chargePointId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/settings`;
            const response = await this.apiRequest(url, 'GET');

            // Speichere die Einstellungen als Datenpunkte
            await this.SaveValues(`${chargePointId}.settings`, response);

            this.log.info(`Settings for chargepoint ${chargePointId} fetched and saved successfully.`);
        } catch (error) {
            this.log.error(`Error fetching settings for chargepoint ${chargePointId}: ${error.message}`);
        }
    }

    /**
     * Get settings for a specific connector
     * @param {string} chargePointId
     * @param {string} connectorId
     */

    async chargeampsGetConnectorSettings(chargePointId, connectorId) {
        try {
            this.log.info(`Fetching settings for chargepoint ${chargePointId}, connector ${connectorId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/connectors/${connectorId}/settings`;
            const response = await this.apiRequest(url, 'GET');

            // Speichere die Einstellungen als Datenpunkte
            await this.SaveValues(`${chargePointId}.connectors.${connectorId}.settings`, response);

            this.log.info(`Settings for chargepoint ${chargePointId}, connector ${connectorId} fetched and saved successfully.`);
        } catch (error) {
            this.log.error(`Error fetching settings for chargepoint ${chargePointId}, connector ${connectorId}: ${error.message}`);
        }
    }

    /**
     * Update settings for a specific connector
     * @param {string} chargePointId
     * @param {string} connectorId
     * @param {object} settings
     */

    async chargeampsUpdateConnectorSettings(chargePointId, connectorId, settings) {
        try {
            this.log.info(`Updating settings for chargepoint ${chargePointId}, connector ${connectorId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/connectors/${connectorId}/settings`;
            const response = await this.apiRequest(url, 'PUT', settings);

            this.log.info(`Settings for chargepoint ${chargePointId}, connector ${connectorId} updated successfully.`);
            return response;
        } catch (error) {
            this.log.error(`Error updating settings for chargepoint ${chargePointId}, connector ${connectorId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Save values to ioBroker states
     * @param {string} key
     * @param {object} obj
     */
    async SaveValues(key, obj) {
        try {
            for (const [subKey, value] of Object.entries(obj)) {
                const fullKey = `${key}.${subKey}`;
                await this.setObjectNotExistsAsync(fullKey, {
                    type: 'state',
                    common: {
                        name: subKey,
                        role: 'value',
                        read: true,
                        write: true,
                        type: typeof value,
                    },
                    native: {},
                });
                await this.setStateAsync(fullKey, { val: value, ack: true });
            }
        } catch (error) {
            this.log.error(`Error saving values: ${error.message}`);
        }
    }
    async createControlStates(chargerId, connectorId) {
        try {
            if (!connectorId) {
                await this.setObjectNotExistsAsync(`${chargerId}.Control`, {
                    type: 'folder',
                    common: {
                        name: 'Control',
                        read: true,
                        write: true,
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(`${chargerId}.Control.Reboot`, {
                    type: 'state',
                    common: {
                        name: 'Reboot',
                        role: 'button',
                        read: false,
                        write: true,
                        type: 'boolean',
                        def: false,
                    },
                    native: {},
                });
            } else {
                await this.setObjectNotExistsAsync(`${chargerId}.Control.RemoteStart_${connectorId}`, {
                    type: 'state',
                    common: {
                        name: `Remote Start for Connector ${connectorId}`,
                        role: 'button',
                        read: false,
                        write: true,
                        type: 'boolean',
                        def: false,
                    },
                    native: {},
                });
            }

            this.log.info(`Control states for ${chargerId} (Connector: ${connectorId || 'N/A'}) wurden erstellt.`);
        } catch (error) {
            this.log.error(`Error creating control states for ${chargerId}: ${error.message}`);
        }
    }

    /**
     * Reboot a specific chargepoint
     * @param {string} chargePointId
     */
    async chargeampsReboot(chargePointId) {
        try {
            this.log.info(`Rebooting chargepoint ${chargePointId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/reboot`;
            const response = await this.apiRequest(url, 'PUT');
            this.log.info(`Reboot successful for chargepoint ${chargePointId}`);
            return response;
        } catch (error) {
            this.log.error(`Error rebooting chargepoint ${chargePointId}: ${error.message}`);
            throw error;
        }
    }

    /**
    * Start charging remotely
        * @param {string} chargePointId
        * @param {string} connectorId
        */
    async chargeampsRemoteStart(chargePointId, connectorId) {
        try {
            this.log.info(`Starting remote charging for chargepoint ${chargePointId}, connector ${connectorId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/connectors/${connectorId}/remoteStart`;
            const response = await this.apiRequest(url, 'PUT');
            this.log.info(`Remote start successful for chargepoint ${chargePointId}, connector ${connectorId}`);
            return response;
        } catch (error) {
            this.log.error(`Error starting remote charging for chargepoint ${chargePointId}, connector ${connectorId}: ${error.message}`);
            throw error;
        }
    }

    /**
    * Stop charging remotely
    * @param {string} chargePointId
    * @param {string} connectorId
    */
    async chargeampsRemoteStop(chargePointId, connectorId) {
        try {
            this.log.info(`Stopping remote charging for chargepoint ${chargePointId}, connector ${connectorId}`);
            const url = `https://eapi.charge.space/api/v5/chargepoints/${chargePointId}/connectors/${connectorId}/remoteStop`;
            const response = await this.apiRequest(url, 'PUT');
            this.log.info(`Remote stop successful for chargepoint ${chargePointId}, connector ${connectorId}`);
            return response;
        } catch (error) {
            this.log.error(`Error stopping remote charging for chargepoint ${chargePointId}, connector ${connectorId}: ${error.message}`);
            throw error;
        }
    }
}

// @ts-ignore
if (require.main !== module) {
    module.exports = (options) => new Chargeamps(options);
} else {
    new Chargeamps();
}