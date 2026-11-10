package com.smartwallet.app.accessibility;

import java.util.ArrayList;
import java.util.List;

/** 仅修改本应用的组件，保留其他无障碍服务及原有顺序。 */
final class AccessibilityServiceList {
    private AccessibilityServiceList() {}

    static boolean contains(String services, String target) {
        for (String service : entries(services)) {
            if (service.equals(target)) return true;
        }
        return false;
    }

    static String without(String services, String target) {
        List<String> result = entries(services);
        result.removeIf(target::equals);
        return String.join(":", result);
    }

    static String with(String services, String target) {
        if (contains(services, target)) return services;
        List<String> result = entries(services);
        result.add(target);
        return String.join(":", result);
    }

    private static List<String> entries(String services) {
        List<String> result = new ArrayList<>();
        if (services != null && !services.isEmpty()) {
            for (String entry : services.split(":")) {
                if (!entry.isEmpty()) result.add(entry);
            }
        }
        return result;
    }
}
