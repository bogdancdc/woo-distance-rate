<?php
/*
Plugin Name: Distance rate shipping
Description: Distance rate shipping
Version: 1.0
Author: cdc
*/

if(!defined( 'ABSPATH' )) exit;

if (!defined('WPINC')) die;

// Настройки плагина
function custom_shipping_settings_fields($settings) {
    $custom_settings = array(
        // Заголовок раздела
        array(
            'title' => 'Настройки расчета доставки',
            'type'  => 'title',
            'desc'  => '',
            'id'    => 'custom_shipping_section_title'
        ),

        // Поле настройки
        array(
            'title'   => 'Единая ставка доставки',
            'desc'    => 'Переопределяем стандартную стоимость доставки, указанную в настройках WooCommerce',
            'id'      => 'custom_shipping_cost',
            'type'    => 'number',
            'default' => '500',
        ),
        array(
            'title'   => 'Расстояние от МКАД',
            'desc'    => 'Расстояние от МКАД, на котором будет стандартная стоимость доставки',
            'id'      => 'custom_shipping_mkad_distance',
            'type'    => 'number',
            'default' => '15',
        ),
        array(
            'title'   => 'Стоимость километра за пределами МКАД',
            'desc'    => 'Стоимость километра за пределами МКАД',
            'id'      => 'custom_shipping_mkad_distance_cost',
            'type'    => 'number',
            'default' => '30',
        ),
        array(
            'title'   => 'Ключ апи от Яндекс',
            'id'      => 'custom_shipping_yandex_api_key',
            'type'    => 'password',
            'default' => '',
        ),
        array(
            'title'   => 'Ключ апи от Геосаджеста',
            'id'      => 'custom_shipping_suggest_api_key',
            'type'    => 'password',
            'default' => '',
        ),
        array(
            'title'   => 'Уведомление под кнопку расчета',
            'id'      => 'custom_shipping_notification',
            'type'    => 'textarea',
            'default' => '',
        ),
        array(
            'title'   => 'Уведомление на превышение возможного расстояния доставки',
            'id'      => 'custom_shipping_long_distance_notification',
            'type'    => 'textarea',
            'default' => '',
        ),
        

        // Окончание раздела
        array(
            'type' => 'sectionend',
            'id'   => 'custom_shipping_section_end'
        ),
    );
    
    $new_settings = array_merge( $settings, $custom_settings );

    return $new_settings;
}
add_filter( 'woocommerce_shipping_settings', 'custom_shipping_settings_fields' );

add_filter('clean_url', 'hook_strip_ampersand', 99, 3);
function hook_strip_ampersand($url, $original_url, $_context) {
    if (strstr($url, "api-maps.yandex.ru") !== false) {
        $url = str_replace("&#038;", "&", $url);
    }
    return $url;
}
add_filter('clean_url', 'hook_strip_ampersand_', 99, 3);
function hook_strip_ampersand_($url, $original_url, $_context) {
    if (strstr($url, "suggest-maps.yandex.ru") !== false) {
        $url = str_replace("&#038;", "&", $url);
    }

    return $url;
}


// Подключаем скрипты
function your_plugin_enqueue_scripts() {
    if (is_checkout() ) {
        $apikey = get_option( "custom_shipping_yandex_api_key" );
        
        $suggestApikey = get_option( "custom_shipping_suggest_api_key" );

        $args = array(
            'apikey' => $apikey,
            'suggest_apikey' => $suggestApikey,
            'lang' => 'ru_RU'
        );
        
        $api_url = "https://api-maps.yandex.ru/2.1/?apikey={$apikey}&suggest_apikey={$suggestApikey}&lang=ru_RU}";
        wp_enqueue_script('yandex-maps-api', add_query_arg($args, $api_url));
        
        wp_register_script('woo-distance-rate-shipping', plugins_url('/js/woo-distance-rate-shipping.js', __FILE__), array('jquery'), '1.0', true);
        
        // Получаем значения настроек при помощи функции get_option()
        $custom_shipping_cost = get_option( 'custom_shipping_cost' );
        $mkad_distance = get_option( 'custom_shipping_mkad_distance' );
        $mkad_distance_cost = get_option( 'custom_shipping_mkad_distance_cost' );
        $long_distance_notification = get_option( 'custom_shipping_long_distance_notification' );

        // Передаем значения настроек в скрипт плагина
        wp_localize_script( 'woo-distance-rate-shipping', 'distanceRateShippingData', array(
            'customShippingCost' => $custom_shipping_cost,
            'mkadDistance' => $mkad_distance,
            'mkadDistanceCost' => $mkad_distance_cost,
            'longDistanceNotification' => $long_distance_notification,
        ) );

        wp_enqueue_script( 'woo-distance-rate-shipping' );
    }
}

add_action('wp_enqueue_scripts', 'your_plugin_enqueue_scripts');



function add_delivery_cost_button() {
    if (is_checkout() ) {
        // Проверяем, что мы находимся на странице оформления заказа
        if (is_checkout()) {
            // Выводим кнопку после поля ввода адреса
            echo '<div id="map" style="/*height: 400px; width: 100%;*/"></div>';
            echo '<br>';
            echo '<button id="calculate_delivery_cost_button" class="button" type="button">Рассчитать стоимость доставки</button>';
            echo get_option( 'custom_shipping_notification' );
            echo '<br>';
        }
    }
}
add_action('woocommerce_after_checkout_billing_form', 'add_delivery_cost_button');

add_action('wp_ajax_set_shipping_price', 'set_shipping_price');
add_action('wp_ajax_nopriv_set_shipping_price', 'set_shipping_price');

function set_shipping_price(){
    if (isset($_POST['cost'])){
        $new_cost = $_POST['cost'];
    }
    WC()->session->set( 'shipping_calculated_cost', $new_cost );
    wp_die();
}

add_filter('woocommerce_package_rates', 'update_shipping_costs_based_on_cart_session_custom_data', 10, 2);

function update_shipping_costs_based_on_cart_session_custom_data( $rates, $package ){
    if ( is_admin() && ! defined( 'DOING_AJAX' ) && is_checkout() )
        $cost = get_option( 'custom_shipping_cost' );
        $calculated_cost = WC()->session->get( 'shipping_calculated_cost');
        
        foreach ( $rates as $rate ) { 
            $method_id = $rate->method_id; 
            $rate_id = $rate->id;
            if ( 'flat_rate' === $method_id ) {
                if( ! empty( $calculated_cost ) ) {
                    $cost = $calculated_cost;
                }
                $rates[$rate_id]->cost = $cost;
            }
        }
    return $rates;
}

// Добавление маршрута API
add_action('rest_api_init', 'register_custom_api_endpoint');

function register_custom_api_endpoint() {
    register_rest_route('custom/v1', '/update-shipping-costs', array(
        'methods' => 'POST',
        'callback' => 'update_shipping_costs_api',
        'permission_callback' => '__return_true',
    ));
}

// Добавление маршрута API
add_action('rest_api_init', 'register_custom_api_endpoint_get_s_data');

function register_custom_api_endpoint_get_s_data() {
    register_rest_route('custom/v1', '/get-shipping-cost-data', array(
        'methods' => 'GET',
        'callback' => 'get_shipping_costs_data',
        'permission_callback' => '__return_true',
    ));
}

function get_shipping_costs_data($request) {
    // Получаем значения настроек при помощи функции get_option()
    $custom_shipping_cost = get_option( 'custom_shipping_cost' );
    $mkad_distance = get_option( 'custom_shipping_mkad_distance' );
    $mkad_distance_cost = get_option( 'custom_shipping_mkad_distance_cost' );
    $long_distance_notification = get_option( 'custom_shipping_long_distance_notification' );

    // Собираем данные в ассоциативный массив
    $data = array(
        'customShippingCost' => $custom_shipping_cost,
        'mkadDistance' => $mkad_distance,
        'mkadDistanceCost' => $mkad_distance_cost,
        'longDistanceNotification' => $long_distance_notification,
    );

    // Отправляем данные в формате JSON
    return rest_ensure_response($data);
}

// Обработчик маршрута API
function update_shipping_costs_api($request) {
    $data = $request->get_json_params();
    
    if (empty($data)) {
        return new WP_Error('no_data', 'No data provided', array('status' => 400));
    }
    
    // Вызов функции обновления стоимости доставки с полученными данными
    $updated_rates = update_shipping_costs_based_on_api_data(null, $data['calculated_cost']);
    
    // Возврат обновленных ставок доставки в формате JSON
    return rest_ensure_response($updated_rates);
}

function update_shipping_costs_based_on_api_data($rates, $calculated_cost) {
    // Если нет переданных данных о стоимости, просто вернуть ставки без изменений
    if (empty($calculated_cost)) {
        return $rates;
    }
    
    // Обновление стоимости доставки на основе полученных данных
    foreach ($rates as $rate_key => $rate) {
        $method_id = $rate->method_id;
        $rate_id = $rate->id;
        if ('flat_rate' === $method_id) {
            $rates[$rate_id]->cost = $calculated_cost;
        }
    }
    
    return $rates;
}
