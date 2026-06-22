<script setup lang="ts">
const selectedFile = ref<File | null>(null);
const errorMessage = ref("");
const copied = ref(false);
const lastShareUrl = ref("");

const { uploadFile, uploadProgress, isUploading, maxFileBytes, formatBytes } =
    useEncryptedFileShare();

const normalizedUploadProgress = computed(() =>
    Math.round(uploadProgress.value * 100),
);

async function handleUpload() {
    if (!selectedFile.value) {
        return;
    }

    copied.value = false;
    errorMessage.value = "";

    try {
        const result = await uploadFile(selectedFile.value);
        lastShareUrl.value = result.shareUrl;
        selectedFile.value = null;
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Upload failed.";
    }
}

async function copyShareLink() {
    if (!lastShareUrl.value || !import.meta.client) {
        return;
    }

    await navigator.clipboard.writeText(lastShareUrl.value);
    copied.value = true;
}
</script>

<template>
    <div
        class="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10 sm:px-6 lg:px-8"
    >
        <div class="space-y-4 w-full">
            <UFileUpload
                v-model="selectedFile"
                label="Drop or select any file here"
                :description="`Max. ${formatBytes(maxFileBytes)}`"
                class="w-full"
                size="xl"
                :disabled="isUploading"
            />

            <div v-if="selectedFile" class="flex justify-center">
                <UButton
                    :disabled="!selectedFile || isUploading"
                    :loading="isUploading"
                    size="xl"
                    class="rounded-xl"
                    @click="handleUpload"
                >
                    Upload and share!
                </UButton>
            </div>

            <UProgress v-if="isUploading" v-model="normalizedUploadProgress" />

            <UAlert
                v-if="errorMessage"
                color="error"
                variant="soft"
                title="Upload failed"
                :description="errorMessage"
            />

            <UAlert
                v-if="lastShareUrl"
                color="success"
                variant="soft"
                title="Share link ready"
                description="The encryption key only lives in the link itself."
            >
                <template #description>
                    <div class="flex flex-wrap gap-2">
                        <UButton
                            size="sm"
                            color="success"
                            variant="soft"
                            @click="copyShareLink"
                        >
                            {{ copied ? "Copied" : "Copy share link" }}
                        </UButton>
                        <UButton
                            size="sm"
                            color="neutral"
                            variant="soft"
                            :to="lastShareUrl"
                        >
                            Open share page
                        </UButton>
                    </div>
                </template>
            </UAlert>
        </div>
    </div>
</template>
