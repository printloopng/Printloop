const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ipp = require("ipp");

const port = Number(process.env.PORT || 6310);
const outDir = path.resolve(process.env.OUT_DIR || path.join(__dirname, "..", "fake-printer-output"));
fs.mkdirSync(outDir, { recursive: true });

let nextJobId = 1;

function respond(res, body) {
  const buf = ipp.serialize(body);
  res.writeHead(200, { "Content-Type": "application/ipp", "Content-Length": buf.length });
  res.end(buf);
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let msg;
      try {
        msg = ipp.parse(Buffer.concat(chunks));
      } catch {
        res.writeHead(400);
        return res.end();
      }
      const base = { version: "2.0", id: msg.id, "operation-attributes-tag": { "attributes-charset": "utf-8", "attributes-natural-language": "en" } };

      if (msg.operation === "Print-Job") {
        const id = nextJobId++;
        const name = String(msg["operation-attributes-tag"]?.["job-name"] || `job-${id}`).replace(/[^\w.-]+/g, "_");
        const file = path.join(outDir, `${String(id).padStart(3, "0")}-${name}.pdf`);
        fs.writeFileSync(file, msg.data || Buffer.alloc(0));
        const attrs = msg["job-attributes-tag"] || {};
        console.log(`[fake-printer] job ${id} "${name}" ${(msg.data || []).length} bytes ${JSON.stringify(attrs)} -> ${file}`);
        return respond(res, {
          ...base,
          statusCode: "successful-ok",
          "job-attributes-tag": { "job-id": id, "job-uri": `ipp://localhost:${port}/jobs/${id}`, "job-state": "completed", "job-state-reasons": "job-completed-successfully" },
        });
      }

      if (msg.operation === "Get-Printer-Attributes") {
        return respond(res, {
          ...base,
          statusCode: "successful-ok",
          "printer-attributes-tag": {
            "printer-name": "PrintLoop Fake Printer",
            "printer-make-and-model": "Fake IPP 1.0",
            "printer-state": "idle",
            "printer-state-reasons": "none",
            "color-supported": true,
            "sides-supported": ["one-sided", "two-sided-long-edge"],
            "media-supported": ["iso_a4_210x297mm", "iso_a3_297x420mm"],
          },
        });
      }

      respond(res, { ...base, statusCode: "server-error-operation-not-supported" });
    });
  })
  .listen(port, () => {
    console.log(`[fake-printer] ipp://localhost:${port}/ipp/print  (jobs saved to ${outDir})`);
  });
