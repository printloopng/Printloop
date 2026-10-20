if (process.env.TEST_VERBOSE !== '1') {
  for (const level of ['log', 'info', 'warn', 'debug'] as const) {
    jest.spyOn(console, level).mockImplementation(() => undefined);
  }
}
