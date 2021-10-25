import {mocked} from 'ts-jest/utils';
import Monitor from '../src/Monitor';
import {consoleLogger} from '../src/loggers';
import {MonitorOptions} from '../src';
import {
    assertGaugeWasCalled,
    assertIncrementWasCalled,
    assertIncrementWasNotCalled,
    assertTimingWasCalled,
} from './utils';
// import {StatsdPluginOptions} from '../src/plugins/StatsdPlugin';
// import {Logger} from '../src/Logger';
import {StatsdPlugin} from './__mocks__/plugins/StatsdPlugin';

jest.mock('../src/plugins/StatsdPlugin', () => StatsdPlugin);
jest.mock('../src/loggers', () => ({
    consoleLogger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
    emptyLogger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// const statsdOptions: MonitorOptions['statsd'] = {
//     apiKey: 'key',
//     host: 'host',
//     root: 'root',
// };

const plugin = new StatsdPlugin();
const defaultMonitorOptions: MonitorOptions = {
    serviceName: 'test-service',
    plugins: [plugin],
};

describe('Monitor', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('monitored', () => {
        describe('validate result', () => {
            test('sync function', async () => {
                const mockReturn = 10;
                const mockFunc = jest.fn().mockReturnValue(mockReturn);
                const monitor = new Monitor({...defaultMonitorOptions});

                const res = monitor.monitored('test', mockFunc);

                expect(mockFunc).toBeCalledTimes(1);
                expect(res).toEqual(mockReturn);
            });

            test('async function', async () => {
                const mockReturn = 10;
                const mockFunc = jest.fn().mockResolvedValue(mockReturn);
                const monitor = new Monitor({...defaultMonitorOptions});

                const res = await monitor.monitored('test', mockFunc);

                expect(mockFunc).toBeCalledTimes(1);
                expect(res).toEqual(mockReturn);
            });

            test('sync function throws', async () => {
                const mockError = new Error('error');
                const mockFunc = jest.fn(() => {
                    throw mockError;
                });
                const monitor = new Monitor({...defaultMonitorOptions});

                try {
                    monitor.monitored('test', mockFunc);

                    fail('should throw error');
                } catch (err) {
                    expect(err).toEqual(mockError);
                }

                expect(mockFunc).toBeCalledTimes(1);
            });

            test('async function throws', async () => {
                const mockError = new Error('error');
                const mockFunc = jest.fn().mockRejectedValue(mockError);
                const monitor = new Monitor({...defaultMonitorOptions});

                try {
                    await monitor.monitored('test', mockFunc);

                    fail('should throw error');
                } catch (err) {
                    expect(err).toEqual(mockError);
                }

                expect(mockFunc).toBeCalledTimes(1);
            });
        });

        describe('shouldMonitorExecutionStart', () => {
            test('true', async () => {
                const mockReturn = 10;
                const mockFunc = jest.fn().mockReturnValue(mockReturn);
                const monitor = new Monitor({...defaultMonitorOptions, shouldMonitorExecutionStart: true});

                const res = monitor.monitored('test', mockFunc);

                expect(mockFunc).toBeCalledTimes(1);
                expect(res).toEqual(mockReturn);
                assertIncrementWasCalled(plugin, 'test.start');
                expect(mocked(consoleLogger.debug)).toHaveBeenCalledWith('test.start', {extra: undefined});
            });

            test('false', async () => {
                const mockReturn = 10;
                const mockFunc = jest.fn().mockReturnValue(mockReturn);
                const monitor = new Monitor({...defaultMonitorOptions, shouldMonitorExecutionStart: false});

                const res = monitor.monitored('test', mockFunc);

                expect(mockFunc).toBeCalledTimes(1);
                expect(res).toEqual(mockReturn);
                assertIncrementWasNotCalled(plugin, 'test.start');
                expect(mocked(consoleLogger.debug)).not.toHaveBeenCalledWith('test.start', expect.anything());
            });
        });

        describe('result', () => {
            const mockReturn = 10;

            [false, true].forEach((isAsync) => {
                const mockFunc: any = isAsync
                    ? () =>
                          new Promise<number>((resolve) => {
                              resolve(mockReturn);
                          })
                    : () => mockReturn;

                describe(`${isAsync ? 'async' : 'sync'} function`, () => {
                    test('default options', async () => {
                        const monitor = new Monitor({...defaultMonitorOptions});

                        const res = monitor.monitored('test', mockFunc);

                        if (isAsync) {
                            await res;
                        }

                        assertIncrementWasCalled(plugin, 'test.success');
                        assertGaugeWasCalled(plugin, 'test.ExecutionTime');
                        assertTimingWasCalled(plugin, 'test.ExecutionTime');

                        expect(mocked(consoleLogger.debug)).toHaveBeenCalledWith('test.success', {
                            extra: {
                                executionTime: expect.any(Number),
                                executionResult: 'NOT_LOGGED',
                            },
                        });
                    });

                    test('send context', async () => {
                        const context = {a: 'a', b: 'bbbbb', c: true};
                        const monitor = new Monitor({...defaultMonitorOptions});

                        const res = monitor.monitored('test', mockFunc, {context});

                        if (isAsync) {
                            await res;
                        }

                        expect(mocked(consoleLogger.debug)).toHaveBeenCalledWith('test.success', {
                            extra: {
                                ...context,
                                executionTime: expect.any(Number),
                                executionResult: 'NOT_LOGGED',
                            },
                        });
                    });

                    test('logResult: true', async () => {
                        const monitor = new Monitor({...defaultMonitorOptions, shouldMonitorExecutionStart: false});

                        const res = monitor.monitored('test', mockFunc);

                        if (isAsync) {
                            await res;
                        }

                        expect(mocked(consoleLogger.debug)).toHaveBeenCalledWith('test.success', {
                            extra: {
                                executionTime: expect.any(Number),
                                executionResult: mockReturn,
                            },
                        });
                    });

                    // TODO: Parsing is probably dependent on the logger plugin used.
                    test.skip('logResult: true with parseResult', async () => {
                        const monitor = new Monitor({...defaultMonitorOptions});
                        const mockParsedReturn = 50;
                        // const parseResult = jest.fn().mockReturnValue(mockParsedReturn);

                        let res = monitor.monitored('test', mockFunc);

                        if (isAsync) {
                            res = await res;
                        }

                        expect(res).toEqual(mockReturn);

                        expect(mocked(consoleLogger.debug)).toHaveBeenCalledWith('test.success', {
                            extra: {
                                executionTime: expect.any(Number),
                                executionResult: mockParsedReturn,
                            },
                        });
                    });
                });
            });
        });

        describe('error', () => {
            const mockError = new Error('error');

            [false, true].forEach((isAsync) => {
                const mockFunc: any = isAsync
                    ? () =>
                          new Promise<number>((_, reject) => {
                              reject(mockError);
                          })
                    : () => {
                          throw mockError;
                      };

                describe(`${isAsync ? 'async' : 'sync'} function`, () => {
                    test('default options', async () => {
                        const monitor = new Monitor({...defaultMonitorOptions});

                        try {
                            const res = monitor.monitored('test', mockFunc);

                            if (isAsync) {
                                await res;
                            }

                            fail('Should not success');
                        } catch (err) {
                            expect(err).toEqual(mockError);

                            assertIncrementWasCalled(plugin, 'test.error');

                            expect(mocked(consoleLogger.error)).toHaveBeenCalledWith('test.error', {
                                err: mockError,
                                extra: undefined,
                            });
                        }
                    });

                    test('send context', async () => {
                        const context = {a: 'a', b: 'bbbbb', c: true};
                        const monitor = new Monitor({...defaultMonitorOptions});

                        try {
                            const res = monitor.monitored('test', mockFunc, {context});

                            if (isAsync) {
                                await res;
                            }

                            fail('Should not success');
                        } catch (err) {
                            expect(err).toEqual(mockError);

                            expect(mocked(consoleLogger.error)).toHaveBeenCalledWith('test.error', {
                                err: mockError,
                                extra: context,
                            });
                        }
                    });
                });
            });
        });
    });
});
