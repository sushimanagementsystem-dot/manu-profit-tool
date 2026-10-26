import { Module } from '@nestjs/common';

import { ExtractionIngestService } from './extraction-ingest.service';
import { N8nClient } from './n8n.client';

@Module({
  providers: [ExtractionIngestService, N8nClient],
  exports: [ExtractionIngestService, N8nClient],
})
export class ExtractionModule {}
