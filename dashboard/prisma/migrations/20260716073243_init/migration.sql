-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_name" TEXT,
    "hardware_info" JSONB,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_ms" DOUBLE PRECISION NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "ram_used_mb" DOUBLE PRECISION NOT NULL,
    "gpu_util_percent" DOUBLE PRECISION NOT NULL,
    "gpu_mem_used_mb" DOUBLE PRECISION NOT NULL,
    "trace_ref" TEXT,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stage_run_id_idx" ON "Stage"("run_id");

-- CreateIndex
CREATE INDEX "Metric_stage_id_timestamp_idx" ON "Metric"("stage_id", "timestamp");

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
