import { Request, Response } from 'express';
import { openApiSpec } from '@/modules/platform/openapi.spec';

export class OpenApiController {
  getSpec = (_req: Request, res: Response): void => {
    res.json(openApiSpec);
  };

  getDocs = (_req: Request, res: Response): void => {
    res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PrintLoop API — docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#ui',
      });
    </script>
  </body>
</html>`);
  };
}

export const openApiController = new OpenApiController();
