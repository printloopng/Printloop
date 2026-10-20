import config from "@printloop/config/eslint";

export default [...config, { rules: { "@next/next/no-html-link-for-pages": "off" } }];
