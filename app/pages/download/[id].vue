<script setup lang="ts">
const route = useRoute();
const errorMessage = ref("");
const downloaded = ref(false);

const { downloadFile, downloadProgress, isDownloading } =
    useEncryptedFileShare();

const normalizeDownloadProgress = computed(() =>
    Math.round(downloadProgress.value * 100),
);

function normalizeFileId(value: string) {
    const match = value
        .trim()
        .toLowerCase()
        .match(/[a-f0-9]{32}/);
    return match?.[0] || "";
}

const fileId = computed(() => {
    const value = route.params.id;
    return typeof value === "string" ? normalizeFileId(value) : "";
});

const shareKey = computed(() => {
    const value = route.query.key;
    return typeof value === "string" ? value : "";
});

async function handleDownload() {
    errorMessage.value = "";
    downloaded.value = false;

    if (!fileId.value) {
        errorMessage.value = "Missing file id.";
        return;
    }

    if (!shareKey.value) {
        errorMessage.value = "Missing decryption key in the URL.";
        return;
    }

    try {
        await downloadFile(fileId.value, shareKey.value);
        downloaded.value = true;
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Download failed.";
    }
}
</script>

<template>
    <div
        class="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10 sm:px-6 lg:px-8"
    >
        <UCard class="w-full">
            <div class="space-y-4">
                <div class="space-y-1">
                    <h1 class="text-2xl font-semibold">Download file</h1>
                    <p class="text-sm text-gray-600">
                        file metadata could be here but it's not yet :P
                    </p>
                </div>

                <UProgress
                    v-if="isDownloading"
                    v-model="normalizeDownloadProgress"
                />

                <UAlert
                    v-if="errorMessage"
                    color="error"
                    variant="soft"
                    title="Download failed"
                    :description="errorMessage"
                />

                <video v-if="errorMessage" autoplay="true">
                    <source src="/hij_doet_het_niet.webm" type="video/webm" />
                </video>

                <UAlert
                    v-if="downloaded"
                    color="success"
                    variant="soft"
                    title="Download complete"
                    description="do whatever you want with it"
                />

                <div class="flex flex-wrap gap-2">
                    <UFieldGroup>
                        <UButton
                            :loading="isDownloading"
                            :disabled="isDownloading"
                            @click="handleDownload"
                        >
                            Download
                        </UButton>
                        <UButton color="neutral" variant="soft" to="/">
                            Share a file
                        </UButton>
                    </UFieldGroup>
                </div>
            </div>
        </UCard>
    </div>
</template>
