import { state } from './state.js';
import { DOMElements } from './dom.js';
import { UIController } from './ui.js';

export const BluetoothController = {
    async connect() {
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth API not available in this browser.');
            DOMElements.bluetoothStatus.textContent = 'Bluetooth Not Supported';
            DOMElements.bluetoothStatus.className = 'text-red-400';
            return;
        }

        try {
            console.log('Requesting Bluetooth device (Fitness Machine Service)...');

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [0x1826] }], // Fitness Machine Service (0x1826)
                optionalServices: [0x1826] // ensure we can access characteristics
            });

            state.trainer.device = device;
            device.addEventListener('gattserverdisconnected', this.onDisconnect.bind(this));

            DOMElements.connectBtn.disabled = true;
            DOMElements.connectBtn.textContent = 'Connecting...';

            const server = await device.gatt.connect();
            console.log('GATT connected:', server);

            const service = await server.getPrimaryService(0x1826);
            console.log('Fitness Machine service obtained:', service);

            // Indoor Bike Data (0x2AD2) and Fitness Machine Control Point (0x2AD9)
            state.trainer.dataCharacteristic = await service.getCharacteristic(0x2AD2);
            state.trainer.controlCharacteristic = await service.getCharacteristic(0x2AD9).catch(() => {
                console.warn('Control Point not available (expected on some trainers).');
                return null;
            });

            await state.trainer.dataCharacteristic.startNotifications();
            state.trainer.dataCharacteristic.addEventListener('characteristicvaluechanged', this.handleData.bind(this));

            state.trainer.connected = true;
            DOMElements.bluetoothStatus.textContent = 'Connected';
            DOMElements.bluetoothStatus.className = 'text-green-400';
            DOMElements.connectBtn.textContent = 'Connected';
            DOMElements.connectBtn.disabled = true;

            console.log('Notifications started for Indoor Bike Data.');

        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            DOMElements.bluetoothStatus.textContent = 'Connection Failed';
            DOMElements.bluetoothStatus.className = 'text-red-400';
            DOMElements.connectBtn.disabled = false;
            DOMElements.connectBtn.textContent = 'Connect to Trainer';
        }
    },
    onDisconnect() {
        state.trainer.connected = false;
        state.trainer.device = null;
        DOMElements.bluetoothStatus.textContent = 'Disconnected';
        DOMElements.bluetoothStatus.className = 'text-red-400';
        DOMElements.connectBtn.disabled = false;
        DOMElements.connectBtn.textContent = 'Connect to Trainer';
        console.log('Trainer disconnected.');
    },
    handleData(event) {
        try {
            const value = event.target.value; // This is a DataView
            const rawBytes = new Uint8Array(value.buffer);
            const hex = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            DOMElements.debugRawHex.textContent = hex;

            const flags = value.getUint16(0, true);
            // Correct flag for Instantaneous Power is bit 6 (0x0040)
            const powerFieldPresent = (flags & 0x0040) !== 0;

            if (powerFieldPresent) {
                let offset = 2; // Start after the 2-byte flags field.
                // The following fields are all uint16 (2 bytes) unless specified otherwise
                if (flags & 0x0002) offset += 2; // Average Speed
                if (flags & 0x0004) offset += 2; // Instantaneous Cadence
                if (flags & 0x0008) offset += 2; // Average Cadence
                if (flags & 0x0010) offset += 4; // Total Distance (uint32)
                if (flags & 0x0020) offset += 2; // Resistance Level

                if (offset + 1 < value.byteLength) {
                    const power = value.getInt16(offset, true);
                    if (power >= 0 && power < 4000) {
                        state.power = power;
                        UIController.updatePower();
                        DOMElements.debugParsedPower.textContent = `${power} (spec-based)`;
                        DOMElements.debugUsedOffset.textContent = offset;
                        return; // Successfully parsed
                    }
                }
            }

            // Fallback to user-configurable offset if spec-based parsing fails or is not available
            const userOffset = parseInt(DOMElements.powerOffsetInput.value, 10);
            if (!isNaN(userOffset) && userOffset < value.byteLength - 1) {
                const fallbackPower = value.getInt16(userOffset, true);
                if (fallbackPower >= 0 && fallbackPower < 4000) {
                    state.power = fallbackPower;
                    UIController.updatePower();
                    DOMElements.debugParsedPower.textContent = `${fallbackPower} (fallback offset ${userOffset})`;
                    DOMElements.debugUsedOffset.textContent = userOffset;
                    return;
                }
            }

            console.warn('Unable to parse power value from notification.');
            DOMElements.debugParsedPower.textContent = 'n/a';

        } catch (err) {
            console.error('Error parsing indoor bike data:', err);
        }
    },
    setGradient(gradient) {
        if (!state.trainer.connected || !state.trainer.controlCharacteristic) return;

        gradient = Math.max(-10, Math.min(20, gradient));
        const gradientValue = Math.round(gradient * 100);

        const command = new Uint8Array(5);
        const dataView = new DataView(command.buffer);
        dataView.setUint8(0, 0x11); // Set Simulation Parameters
        dataView.setInt16(1, 0, true); // Wind speed (0)
        dataView.setInt16(3, gradientValue, true); // Grade

        state.trainer.controlCharacteristic.writeValue(command)
            .catch(err => console.error("Error setting gradient:", err));
    }
};
