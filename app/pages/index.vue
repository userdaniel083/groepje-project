<script setup lang="ts">
const selectedFile = ref<File | null>(null);
const errorMessage = ref("");
const copied = ref(false);
const lastShareUrl = ref("");

const { uploadFile, uploadProgress, isUploading, maxFileBytes, formatBytes } =
    useEncryptedFileShare();

const normalizedUploadProgress = computed(() =>
    Math.round(uploadProgress * 100),
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
        <UCard class="w-full">
            <div class="space-y-4">
                <div class="space-y-1">
                    <h1 class="text-2xl font-semibold">Share a file</h1>
                    <p class="text-sm text-gray-600">It's secure! (probably)</p>
                </div>

                <UFileUpload
                    v-model="selectedFile"
                    label="Pick a file"
                    :description="`Maximum size: ${formatBytes(maxFileBytes)}`"
                    class="w-full"
                    :disabled="isUploading"
                />

                <div class="flex flex-wrap items-center gap-3">
                    <UButton
                        :disabled="!selectedFile || isUploading"
                        :loading="isUploading"
                        @click="handleUpload"
                    >
                        Upload file
                    </UButton>

                    <span v-if="selectedFile" class="text-sm text-gray-600">
                        {{ selectedFile.name }} ·
                        {{ formatBytes(selectedFile.size) }}
                    </span>
                </div>

                <UProgress v-model="normalizedUploadProgress" />

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
                                external
                            >
                                Open share page
                            </UButton>
                        </div>
                    </template>
                </UAlert>
            </div>
        </UCard>
    </div>
</template>
