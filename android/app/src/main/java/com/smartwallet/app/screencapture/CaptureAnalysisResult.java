package com.smartwallet.app.screencapture;

public class CaptureAnalysisResult {

    private final boolean supported;
    private final String transactionType;
    private final double amount;
    private final String merchantName;
    private final String occurredAt;
    private final String categoryId;
    private final String note;
    private final String summary;
    private final String errorMessage;

    public CaptureAnalysisResult(
        boolean supported,
        String transactionType,
        double amount,
        String merchantName,
        String occurredAt,
        String categoryId,
        String note,
        String summary,
        String errorMessage
    ) {
        this.supported = supported;
        this.transactionType = transactionType == null ? "" : transactionType;
        this.amount = amount;
        this.merchantName = merchantName == null ? "" : merchantName;
        this.occurredAt = occurredAt == null ? "" : occurredAt;
        this.categoryId = categoryId == null ? "" : categoryId;
        this.note = note == null ? "" : note;
        this.summary = summary == null ? "" : summary;
        this.errorMessage = errorMessage == null ? "" : errorMessage;
    }

    public static CaptureAnalysisResult unsupported(String errorMessage) {
        return new CaptureAnalysisResult(false, "", 0d, "", "", "", "", "", errorMessage);
    }

    public CaptureAnalysisResult withCategoryId(String nextCategoryId) {
        return new CaptureAnalysisResult(
            supported,
            transactionType,
            amount,
            merchantName,
            occurredAt,
            nextCategoryId,
            note,
            summary,
            errorMessage
        );
    }

    public boolean isSupported() {
        return supported;
    }

    public String getTransactionType() {
        return transactionType;
    }

    public double getAmount() {
        return amount;
    }

    public String getMerchantName() {
        return merchantName;
    }

    public String getOccurredAt() {
        return occurredAt;
    }

    public String getCategoryId() {
        return categoryId;
    }

    public String getNote() {
        return note;
    }

    public String getSummary() {
        return summary;
    }

    public String getErrorMessage() {
        return errorMessage;
    }
}
