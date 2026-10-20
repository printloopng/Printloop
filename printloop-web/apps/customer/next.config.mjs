import { createNextConfig } from "@printloop/config/next";

const storage = [process.env.NEXT_PUBLIC_STORAGE_ORIGIN, "https://res.cloudinary.com", "https://*.amazonaws.com"].filter(Boolean);

export default createNextConfig({ connect: storage });
