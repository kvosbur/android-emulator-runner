"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.killEmulator = exports.launchEmulator = void 0;
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const EMULATOR_BOOT_TIMEOUT_SECONDS = 600;
/**
 * Creates and launches a new AVD instance with the specified configurations.
 */
function launchEmulator(apiLevel, target, arch, profile, cores, ramSize, sdcardPathOrSize, diskSize, avdName, forceAvdCreation, emulatorOptions, disableAnimations, disableSpellChecker, disableLinuxHardwareAcceleration, enableHardwareKeyboard) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Launch Emulator`);
            // create a new AVD if AVD directory does not already exist or forceAvdCreation is true
            const emulatorPortNumber = yield findOpenEmulatorPort();
            const fullAvdName = `${avdName}-${emulatorPortNumber}`;
            const avdPath = `${process.env.ANDROID_AVD_HOME}/${fullAvdName}.avd`;
            if (!fs.existsSync(avdPath) || forceAvdCreation) {
                const profileOption = profile.trim() !== '' ? `--device '${profile}'` : '';
                const sdcardPathOrSizeOption = sdcardPathOrSize.trim() !== '' ? `--sdcard '${sdcardPathOrSize}'` : '';
                console.log(`Creating AVD.`);
                yield exec.exec(`sh -c \\"echo no | avdmanager create avd --force -n "${fullAvdName}" --abi '${target}/${arch}' --package 'system-images;android-${apiLevel};${target};${arch}' ${profileOption} ${sdcardPathOrSizeOption}"`);
            }
            if (cores) {
                yield exec.exec(`sh -c \\"printf 'hw.cpu.ncore=${cores}\n' >> ${process.env.ANDROID_AVD_HOME}/"${fullAvdName}".avd"/config.ini`);
            }
            if (ramSize) {
                yield exec.exec(`sh -c \\"printf 'hw.ramSize=${ramSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${fullAvdName}".avd"/config.ini`);
            }
            if (enableHardwareKeyboard) {
                yield exec.exec(`sh -c \\"printf 'hw.keyboard=yes\n' >> ${process.env.ANDROID_AVD_HOME}/"${fullAvdName}".avd"/config.ini`);
            }
            if (diskSize) {
                yield exec.exec(`sh -c \\"printf 'disk.dataPartition.size=${diskSize}\n' >> ${process.env.ANDROID_AVD_HOME}/"${fullAvdName}".avd"/config.ini`);
            }
            //turn off hardware acceleration on Linux
            if (process.platform === 'linux' && disableLinuxHardwareAcceleration) {
                console.log('Disabling Linux hardware acceleration.');
                emulatorOptions += ' -accel off';
            }
            //add port number to emulator options
            console.log(`Using port ${emulatorPortNumber} for emulator`);
            emulatorOptions += ` -port ${emulatorPortNumber}`;
            process.env["ANDROID_SERIAL"] = `emulator-${emulatorPortNumber}`;
            // start emulator
            console.log('Starting emulator.');
            yield exec.exec(`sh -c \\"${process.env.ANDROID_SDK_ROOT}/emulator/emulator -avd "${fullAvdName}" ${emulatorOptions} &"`, [], {
                listeners: {
                    stderr: (data) => {
                        if (data.toString().includes('invalid command-line parameter')) {
                            throw new Error(data.toString());
                        }
                    }
                }
            });
            // wait for emulator to complete booting
            yield waitForDevice();
            yield exec.exec(`adb shell input keyevent 82`);
            if (disableAnimations) {
                console.log('Disabling animations.');
                yield exec.exec(`adb shell settings put global window_animation_scale 0.0`);
                yield exec.exec(`adb shell settings put global transition_animation_scale 0.0`);
                yield exec.exec(`adb shell settings put global animator_duration_scale 0.0`);
            }
            if (disableSpellChecker) {
                yield exec.exec(`adb shell settings put secure spell_checker_enabled 0`);
            }
            if (enableHardwareKeyboard) {
                yield exec.exec(`adb shell settings put secure show_ime_with_hard_keyboard 0`);
            }
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.launchEmulator = launchEmulator;
/**
 * Kills the running emulator on the default port.
 */
function killEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`::group::Terminate Emulator`);
            yield exec.exec(`adb emu kill`);
        }
        catch (error) {
            console.log(error.message);
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.killEmulator = killEmulator;
/**
 * Kills the running emulator on the default port.
 */
function findOpenEmulatorPort() {
    return __awaiter(this, void 0, void 0, function* () {
        for (let port = 5554; port <= 5570; port += 2) {
            let result = '';
            yield exec.exec(`adb connect localhost:${port}`, [], {
                listeners: {
                    stdout: (data) => {
                        result += data.toString();
                    }
                }
            });
            if (result.trim().includes("Connection refused")) {
                return port;
            }
        }
        throw new Error("Could not find open port for emulator.");
    });
}
/**
 * Wait for emulator to boot.
 */
function waitForDevice() {
    return __awaiter(this, void 0, void 0, function* () {
        let booted = false;
        let attempts = 0;
        const retryInterval = 2; // retry every 2 seconds
        const maxAttempts = EMULATOR_BOOT_TIMEOUT_SECONDS / 2;
        while (!booted) {
            try {
                let result = '';
                yield exec.exec(`adb shell getprop sys.boot_completed`, [], {
                    listeners: {
                        stdout: (data) => {
                            result += data.toString();
                        }
                    }
                });
                if (result.trim() === '1') {
                    console.log('Emulator booted.');
                    booted = true;
                    break;
                }
            }
            catch (error) {
                console.warn(error.message);
            }
            if (attempts < maxAttempts) {
                yield delay(retryInterval * 1000);
            }
            else {
                throw new Error(`Timeout waiting for emulator to boot.`);
            }
            attempts++;
        }
    });
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
