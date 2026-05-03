package com.orderflow.service;

import com.orderflow.config.CacheConfig;
import com.orderflow.dto.ProductResponse;
import com.orderflow.entity.Product;
import com.orderflow.exception.ProductNotFoundException;
import com.orderflow.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {

    private final ProductRepository productRepository;
    private final CacheManager cacheManager;

    @Transactional(readOnly = true)
    public List<ProductResponse> getAllProducts() {
        Cache cache = cacheManager.getCache(CacheConfig.PRODUCTS_CACHE);
        if (cache != null) {
            @SuppressWarnings("unchecked")
            List<ProductResponse> cached = cache.get("all", List.class);
            if (cached != null) {
                log.debug("Cache hit for all products");
                return cached;
            }
        }

        List<ProductResponse> products = productRepository.findAll()
                .stream()
                .map(ProductResponse::from)
                .toList();

        if (cache != null) {
            cache.put("all", products);
        }
        return products;
    }

    @Transactional(readOnly = true)
    public ProductResponse getProduct(Long id) {
        Cache cache = cacheManager.getCache(CacheConfig.PRODUCT_CACHE);
        if (cache != null) {
            ProductResponse cached = cache.get(id.toString(), ProductResponse.class);
            if (cached != null) {
                log.debug("Cache hit for product {}", id);
                return cached;
            }
        }

        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));

        ProductResponse response = ProductResponse.from(product);
        if (cache != null) {
            cache.put(id.toString(), response);
        }
        return response;
    }

    public void evictProductCache(Long productId) {
        Cache productsCache = cacheManager.getCache(CacheConfig.PRODUCTS_CACHE);
        if (productsCache != null) {
            productsCache.evict("all");
        }
        Cache productCache = cacheManager.getCache(CacheConfig.PRODUCT_CACHE);
        if (productCache != null) {
            productCache.evict(productId.toString());
        }
    }
}
